export const SCHEMA_VERSION = 2;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SYNC_CODE_RE = /^[A-Za-z0-9_-]{16,32}$/;

export function charCount(text) {
  return String(text || '').replace(/\s/g, '').length;
}

export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

export function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function isValidSyncCode(code) {
  return SYNC_CODE_RE.test(String(code || '').trim());
}

export function generateSyncCode(random = null, length = 20) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  if (typeof random === 'function') {
    for (let i = 0; i < length; i += 1) bytes[i] = random() & 255;
  } else if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function makeSyncLink(baseUrl, code) {
  if (!isValidSyncCode(code)) throw new Error('同步码格式不正确');
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ code }).toString();
  return url.toString();
}

export function normalizeEntry(raw, fallbackDate, fallbackTimestamp) {
  const now = fallbackTimestamp || new Date().toISOString();
  const id = String(raw?.id || fallbackDate || '').trim();
  return {
    id,
    title: String(raw?.title || '').trim() || '今天的一小步',
    content: String(raw?.content || '').trim(),
    tag: String(raw?.tag || '').trim(),
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || raw?.createdAt || now,
    deleted: raw?.deleted === true
  };
}

export function migrateLegacy(legacy, fallbackTimestamp) {
  const source = legacy && typeof legacy === 'object' ? legacy : {};
  const rows = [];
  for (const [key, value] of Object.entries(source)) {
    if (!DATE_RE.test(key) || !value || typeof value !== 'object') continue;
    const content = String(value.content || '').trim();
    if (!content) continue;
    rows.push(normalizeEntry({ ...value, id: key, deleted: false }, key, fallbackTimestamp));
  }
  return rows;
}

export function entriesToRows(entries) {
  if (Array.isArray(entries)) return entries;
  if (!entries || typeof entries !== 'object') return [];
  return Object.values(entries);
}

export function rowsToMap(rows) {
  const map = {};
  for (const raw of entriesToRows(rows)) {
    if (!raw || !DATE_RE.test(String(raw.id || ''))) continue;
    map[raw.id] = normalizeEntry(raw, raw.id);
  }
  return map;
}

function timestampOf(entry) {
  const stamp = Date.parse(entry?.updatedAt || entry?.createdAt || 0);
  return Number.isFinite(stamp) ? stamp : 0;
}

export function mergeEntries(...collections) {
  const merged = new Map();
  for (const collection of collections) {
    for (const raw of entriesToRows(collection)) {
      const entry = normalizeEntry(raw, raw?.id);
      if (!DATE_RE.test(entry.id)) continue;
      const existing = merged.get(entry.id);
      if (!existing) {
        merged.set(entry.id, entry);
        continue;
      }
      const existingTime = timestampOf(existing);
      const nextTime = timestampOf(entry);
      if (nextTime > existingTime) {
        merged.set(entry.id, entry);
      } else if (nextTime === existingTime && !entry.deleted && existing.deleted) {
        merged.set(entry.id, entry);
      }
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.id.localeCompare(a.id));
}

export function activeEntries(entries) {
  return entriesToRows(entries)
    .filter((entry) => entry && !entry.deleted)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
}

export function calcStreak(entries, todayKey) {
  const active = new Set(activeEntries(entries).map((entry) => entry.id));
  let cursor = dateFromKey(todayKey);
  if (!active.has(todayKey)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (active.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function monthStats(entries, year, monthIndex) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const rows = activeEntries(entries).filter((entry) => entry.id.startsWith(prefix));
  return {
    days: rows.length,
    words: rows.reduce((sum, entry) => sum + charCount(entry.content), 0)
  };
}

export function totalStats(entries) {
  const rows = activeEntries(entries);
  return {
    days: rows.length,
    words: rows.reduce((sum, entry) => sum + charCount(entry.content), 0)
  };
}

export function statePayload(entries) {
  const rows = entriesToRows(entries)
    .filter((entry) => entry && DATE_RE.test(String(entry.id || '')))
    .map((entry) => normalizeEntry(entry, entry.id))
    .sort((a, b) => b.id.localeCompare(a.id));
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: rows
  };
}

export function mergePayload(localEntries, remotePayload) {
  const remoteEntries = remotePayload?.entries || remotePayload || [];
  const rows = mergeEntries(localEntries, remoteEntries);
  return {
    rows,
    map: Object.fromEntries(rows.map((entry) => [entry.id, entry]))
  };
}
