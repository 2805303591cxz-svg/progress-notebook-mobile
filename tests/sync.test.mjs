import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncWithCloud } from '../src/sync-client.js';
import { activeEntries } from '../src/core.js';

test('三台设备通过 Cloudflare 同步码合并记录，删除墓碑不会复活', async () => {
  const store = new Map();
  let rev = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const code = url.searchParams.get('code');
    if (req.method === 'GET') {
      const record = store.get(code);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record || { ok: true, empty: true, rev: 0, data: null }));
      return;
    }
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      rev += 1;
      store.set(body.code, { ok: true, rev, data: body.data });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rev }));
      return;
    }
    res.writeHead(405); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}/`;
  const code = 'ProgressSync2026ABC';
  try {
    const first = await syncWithCloud(code, [
      { id: '2026-10-23', title: '旧记录', content: '电脑上的第一条记录', updatedAt: '2026-10-23T10:00:00.000Z' }
    ], undefined, endpoint);
    assert.equal(first.rows.length, 1);

    const second = await syncWithCloud(code, [], undefined, endpoint);
    assert.equal(activeEntries(second.rows).length, 1);
    assert.equal(second.rows[0].content, '电脑上的第一条记录');

    const changed = second.rows.concat([
      { id: '2026-10-29', title: '手机记录', content: '手机新增的一条', updatedAt: '2026-10-29T10:00:00.000Z' }
    ]);
    await syncWithCloud(code, changed, undefined, endpoint);

    const firstAgain = await syncWithCloud(code, first.rows, undefined, endpoint);
    assert.equal(activeEntries(firstAgain.rows).length, 2);

    const deletedRows = firstAgain.rows.map((entry) => entry.id === '2026-10-23'
      ? { ...entry, deleted: true, updatedAt: '2026-10-29T11:00:00.000Z' }
      : entry
    );
    await syncWithCloud(code, deletedRows, undefined, endpoint);

    const third = await syncWithCloud(code, [], undefined, endpoint);
    assert.equal(activeEntries(third.rows).length, 1);
    assert.equal(third.rows.find((entry) => entry.id === '2026-10-23').deleted, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
