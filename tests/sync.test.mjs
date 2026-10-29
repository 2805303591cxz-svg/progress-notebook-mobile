import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncWithCloud, makeGistSyncLink, parseGistSyncHash, isValidGithubToken } from '../src/sync-client.js';
import { activeEntries } from '../src/core.js';

const TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz123456';

test('私有 Gist 同步：三台设备合并记录，删除墓碑不会复活', async () => {
  const gists = new Map();
  let nextId = 1;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Bad credentials' }));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const match = url.pathname.match(/^\/gists\/([^/]+)$/);
    if (req.method === 'POST' && url.pathname === '/gists') {
      const id = `gist${String(nextId++).padStart(12, '0')}`;
      gists.set(id, body.files['progress-notebook.json'].content);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id }));
      return;
    }
    if (match && req.method === 'GET') {
      const content = gists.get(match[1]);
      if (!content) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: match[1], files: { 'progress-notebook.json': { content, truncated: false } } }));
      return;
    }
    if (match && req.method === 'PATCH') {
      if (!gists.has(match[1])) { res.writeHead(404); res.end(); return; }
      gists.set(match[1], body.files['progress-notebook.json'].content);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: match[1] }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const apiBase = `http://127.0.0.1:${port}`;
  try {
    const created = await syncWithCloud({ token: TOKEN, gistId: '', apiBase }, [
      { id: '2026-10-23', title: '旧记录', content: '电脑上的第一条记录', updatedAt: '2026-10-23T10:00:00.000Z' }
    ]);
    assert.match(created.gistId, /^gist/);
    assert.equal(created.created, true);

    const config = { token: TOKEN, gistId: created.gistId, apiBase };
    const second = await syncWithCloud(config, []);
    assert.equal(activeEntries(second.rows).length, 1);
    assert.equal(second.rows[0].content, '电脑上的第一条记录');

    const changed = second.rows.concat([
      { id: '2026-10-29', title: '手机记录', content: '手机新增的一条', updatedAt: '2026-10-29T10:00:00.000Z' }
    ]);
    await syncWithCloud(config, changed);

    const firstAgain = await syncWithCloud(config, created.rows);
    assert.equal(activeEntries(firstAgain.rows).length, 2);

    const deletedRows = firstAgain.rows.map((entry) => entry.id === '2026-10-23'
      ? { ...entry, deleted: true, updatedAt: '2026-10-29T11:00:00.000Z' }
      : entry
    );
    await syncWithCloud(config, deletedRows);

    const third = await syncWithCloud(config, []);
    assert.equal(activeEntries(third.rows).length, 1);
    assert.equal(third.rows.find((entry) => entry.id === '2026-10-23').deleted, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GitHub 连接链接在 hash 中保存私有连接信息', () => {
  const link = makeGistSyncLink('https://example.github.io/progress/', { gistId: 'abc12345', token: TOKEN });
  assert.equal(new URL(link).searchParams.has('token'), false);
  const parsed = parseGistSyncHash(new URL(link).hash);
  assert.equal(parsed.gistId, 'abc12345');
  assert.equal(parsed.token, TOKEN);
  assert.equal(isValidGithubToken(TOKEN), true);
});
