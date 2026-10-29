import { normalizeEntry, rowsToMap } from './core.js';

const DB_NAME = 'progress-notebook-mobile';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('无法打开本地数据库'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地数据库操作失败'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('本地数据库事务失败'));
    tx.onabort = () => reject(tx.error || new Error('本地数据库事务中止'));
  });
}

export async function getAllEntries() {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  return requestAsPromise(tx.objectStore('entries').getAll());
}

export async function putEntry(entry) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').put(normalizeEntry(entry, entry.id));
  await txDone(tx);
}

export async function putEntries(entries) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  for (const raw of entries || []) if (raw && raw.id) store.put(normalizeEntry(raw, raw.id));
  await txDone(tx);
}

export async function getEntry(id) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  return requestAsPromise(tx.objectStore('entries').get(id));
}

export async function deleteEntry(id, updatedAt = new Date().toISOString()) {
  const existing = await getEntry(id);
  if (!existing) return;
  await putEntry({ ...existing, deleted: true, updatedAt });
}

export async function getMeta(key, fallback = null) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readonly');
  const result = await requestAsPromise(tx.objectStore('meta').get(key));
  return result ? result.value : fallback;
}

export async function setMeta(key, value) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await txDone(tx);
}

export async function requestPersistentStorage() {
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    try { return await navigator.storage.persist(); } catch (_) { return false; }
  }
  return false;
}

export async function importRows(rows) {
  const map = rowsToMap(rows);
  await putEntries(Object.values(map));
  return Object.values(map);
}
