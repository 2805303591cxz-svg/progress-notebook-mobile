import { mergePayload, statePayload } from './core.js';

const DEFAULT_API = 'https://api.github.com';
const FILE_NAME = 'progress-notebook.json';

function headers(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28'
  };
}

async function githubRequest(config, path, options = {}) {
  const base = (config.apiBase || DEFAULT_API).replace(/\/+$/, '');
  const response = await fetch(base + path, {
    ...options,
    cache: 'no-store',
    signal: config.signal,
    headers: { ...headers(config.token), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const hint = response.status === 401
      ? 'GitHub 令牌无效或已过期'
      : response.status === 404
        ? '找不到私有 Gist，请检查连接链接'
        : body?.message || `GitHub 返回 ${response.status}`;
    const error = new Error(hint);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function isValidGithubToken(token) {
  return /^(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(String(token || '').trim());
}

export function isValidGistId(id) {
  return /^[A-Za-z0-9]{8,64}$/.test(String(id || '').trim());
}

export function makeGistSyncLink(baseUrl, { gistId, token }) {
  if (!isValidGistId(gistId) || !token) throw new Error('同步连接信息不完整');
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ gist: gistId, token }).toString();
  return url.toString();
}

export function parseGistSyncHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const gistId = (params.get('gist') || '').trim();
  const token = (params.get('token') || '').trim();
  return gistId && token ? { gistId, token } : null;
}

export async function createPrivateGist(config, rows) {
  const body = {
    description: '进步记录本 · 私人同步数据',
    public: false,
    files: {
      [FILE_NAME]: { content: JSON.stringify(statePayload(rows), null, 2) }
    }
  };
  const result = await githubRequest(config, '/gists', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return result;
}

export async function pullRemote(config) {
  const gist = await githubRequest(config, `/gists/${encodeURIComponent(config.gistId)}`);
  const file = gist.files?.[FILE_NAME];
  if (!file) return { gist, data: null };
  if (file.truncated) throw new Error('同步文件过大，GitHub 返回了截断内容');
  try {
    return { gist, data: file.content ? JSON.parse(file.content) : null };
  } catch (_) {
    throw new Error('Gist 中的同步数据格式损坏');
  }
}

export async function pushRemote(config, rows) {
  const content = JSON.stringify(statePayload(rows), null, 2);
  return githubRequest(config, `/gists/${encodeURIComponent(config.gistId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: { [FILE_NAME]: { content } } })
  });
}

export async function syncWithCloud(config, localRows) {
  if (!config || !isValidGithubToken(config.token)) throw new Error('GitHub 令牌格式不正确');

  if (!config.gistId) {
    const created = await createPrivateGist(config, localRows);
    return { rows: localRows, gistId: created.id, created: true, pushed: true, syncedAt: new Date().toISOString() };
  }

  const remote = await pullRemote(config);
  const merged = mergePayload(localRows, remote.data);
  const remoteEntries = remote.data?.entries || [];
  const mergedSerialized = JSON.stringify(statePayload(merged.rows).entries);
  const remoteSerialized = JSON.stringify(statePayload(remoteEntries).entries);
  let pushed = false;
  if (!remote.data || mergedSerialized !== remoteSerialized) {
    await pushRemote(config, merged.rows);
    pushed = true;
  }
  return {
    rows: merged.rows,
    gistId: remote.gist.id,
    created: false,
    pulled: Boolean(remote.data),
    pushed,
    syncedAt: new Date().toISOString()
  };
}
