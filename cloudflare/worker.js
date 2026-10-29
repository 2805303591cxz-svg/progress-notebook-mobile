const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'no-store'
};
const CODE_RE = /^[A-Za-z0-9_-]{16,32}$/;
const MAX_BYTES = 600_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    let code = (url.searchParams.get('code') || '').trim();
    let body = null;

    if (request.method === 'POST' || request.method === 'PUT') {
      body = await request.json().catch(() => null);
      if (body && typeof body.code === 'string') code = body.code.trim();
    }
    if (!CODE_RE.test(code)) return json({ error: 'bad_code', hint: '同步码需要 16–32 位字母、数字、下划线或短横线' }, 400);

    const key = 'u-' + code.toLowerCase();
    try {
      if (request.method === 'GET') {
        const record = await env.PROGRESS_DB.prepare('SELECT rev, updated_at, data FROM progress_spaces WHERE code = ?').bind(key).first();
        if (!record) return json({ ok: true, empty: true, rev: 0, data: null });
        return json({ ok: true, rev: record.rev || 0, updatedAt: record.updated_at || 0, data: JSON.parse(record.data) });
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        if (!body || !body.data || typeof body.data !== 'object' || !Array.isArray(body.data.entries)) {
          return json({ error: 'bad_body', hint: '同步内容格式不正确' }, 400);
        }
        const serialized = JSON.stringify(body.data);
        if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) {
          return json({ error: 'too_large', hint: '同步内容超过大小限制' }, 413);
        }
        const previous = await env.PROGRESS_DB.prepare('SELECT rev FROM progress_spaces WHERE code = ?').bind(key).first();
        const rev = ((previous && previous.rev) || 0) + 1;
        const now = Date.now();
        await env.PROGRESS_DB.prepare(`
          INSERT INTO progress_spaces (code, rev, updated_at, data) VALUES (?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET
            rev = excluded.rev,
            updated_at = excluded.updated_at,
            data = excluded.data
        `).bind(key, rev, now, serialized).run();
        return json({ ok: true, rev });
      }
      return json({ error: 'method_not_allowed' }, 405);
    } catch (error) {
      return json({ error: 'server_error', detail: String(error && error.message || error) }, 500);
    }
  }
};
