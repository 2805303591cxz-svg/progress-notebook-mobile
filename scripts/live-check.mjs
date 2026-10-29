import fs from 'node:fs';
import { isValidSyncCode } from '../src/core.js';

const siteUrl = (process.argv[2] || '').replace(/\/+$/, '');
const workerUrl = (process.argv[3] || '').trim();
if (!/^https:\/\//.test(siteUrl) || !/^https:\/\//.test(workerUrl)) {
  console.error('用法：node scripts/live-check.mjs https://用户名.github.io/仓库名/ https://同步Worker地址/');
  process.exit(2);
}
const code = fs.readFileSync(new URL('../.sync-code', import.meta.url), 'utf8').trim();
if (!isValidSyncCode(code)) throw new Error('同步码格式不正确');

for (const path of ['/index.html', '/app.js', '/config.js', '/styles.css', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png']) {
  const response = await fetch(siteUrl + path, { cache: 'no-store' });
  console.log(response.status, path);
  if (!response.ok) process.exit(1);
}
const response = await fetch(workerUrl + '?code=' + encodeURIComponent(code), { cache: 'no-store' });
const body = await response.json();
console.log(response.status, 'Cloudflare 同步后端', JSON.stringify({ entries: body.data?.entries?.length || 0 }));
if (!response.ok || (body.data?.entries?.length || 0) < 4) process.exit(1);
console.log('LIVE_CHECK_OK');
