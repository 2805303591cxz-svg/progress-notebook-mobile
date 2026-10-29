import fs from 'node:fs';
import { isValidGithubToken } from '../src/sync-client.js';

const siteUrl = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(siteUrl)) {
  console.error('用法：node scripts/live-check.mjs https://用户名.github.io/仓库名/');
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(new URL('../.sync-config.json', import.meta.url), 'utf8'));
const token = fs.readFileSync(new URL('../.github-sync-token', import.meta.url), 'utf8').trim();
if (!isValidGithubToken(token) || !config.gistId) throw new Error('同步配置不完整');

for (const path of ['/index.html', '/app.js', '/styles.css', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png']) {
  const response = await fetch(siteUrl + path, { cache: 'no-store' });
  console.log(response.status, path);
  if (!response.ok) process.exit(1);
}

const response = await fetch('https://api.github.com/gists/' + config.gistId, {
  headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  cache: 'no-store'
});
const gist = await response.json();
if (!response.ok) throw new Error('Gist 检查失败：' + response.status + ' ' + (gist.message || ''));
const content = gist.files?.['progress-notebook.json']?.content || '{}';
const payload = JSON.parse(content);
console.log(response.status, 'GitHub 私有 Gist', JSON.stringify({ entries: payload.entries?.length || 0 }));
if ((payload.entries?.length || 0) < 4) process.exit(1);
console.log('LIVE_CHECK_OK');
