import { mergePayload, statePayload } from './core.js';
import { SYNC_ENDPOINT } from './config.js';

function endpointFor(code, endpoint) {
  const url = new URL(endpoint);
  url.searchParams.set('code', code);
  return url;
}

async function parseResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.hint || body?.error || `同步服务返回 ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function pullRemote(code, signal, endpoint = SYNC_ENDPOINT) {
  const response = await fetch(endpointFor(code, endpoint), {
    method: 'GET', cache: 'no-store', signal,
    headers: { accept: 'application/json' }
  });
  return parseResponse(response);
}

export async function pushRemote(code, rows, signal, endpoint = SYNC_ENDPOINT) {
  const response = await fetch(endpoint, {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ code, data: statePayload(rows) })
  });
  return parseResponse(response);
}

export async function syncWithCloud(code, localRows, signal, endpoint = SYNC_ENDPOINT) {
  const remote = await pullRemote(code, signal, endpoint);
  const merged = mergePayload(localRows, remote.data);
  const remoteEntries = remote.data?.entries || [];
  const mergedSerialized = JSON.stringify(statePayload(merged.rows).entries);
  const remoteSerialized = JSON.stringify(statePayload(remoteEntries).entries);
  let pushed = false;
  if (!remote.data || mergedSerialized !== remoteSerialized) {
    await pushRemote(code, merged.rows, signal, endpoint);
    pushed = true;
  }
  return {
    rows: merged.rows,
    pulled: Boolean(remote.data),
    pushed,
    remoteRevision: remote.rev || 0,
    syncedAt: new Date().toISOString()
  };
}
