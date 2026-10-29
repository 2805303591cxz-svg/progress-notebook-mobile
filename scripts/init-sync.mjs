import fs from 'node:fs';
import { isValidGithubToken, makeGistSyncLink, syncWithCloud } from '../src/sync-client.js';

const siteUrl = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+\//.test(siteUrl + '/')) {
  console.error('用法：node scripts/init-sync.mjs https://用户名.github.io/仓库名/');
  process.exit(2);
}

const tokenFile = new URL('../.github-sync-token', import.meta.url);
const configFile = new URL('../.sync-config.json', import.meta.url);
const linkFile = new URL('../.sync-link', import.meta.url);
const token = (process.env.GITHUB_SYNC_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '')).trim();
if (!isValidGithubToken(token)) {
  console.error('缺少可用的 GitHub 令牌：写入 .github-sync-token，或设置 GITHUB_SYNC_TOKEN。');
  process.exit(2);
}

let existing = {};
if (fs.existsSync(configFile) && !process.argv.includes('--new')) {
  existing = JSON.parse(fs.readFileSync(configFile, 'utf8'));
}
const rows = JSON.parse(fs.readFileSync(new URL('../data/migration-entries.json', import.meta.url), 'utf8'));
const result = await syncWithCloud({ token, gistId: existing.gistId || '' }, rows);

fs.writeFileSync(configFile, JSON.stringify({ gistId: result.gistId }, null, 2), 'utf8');
const link = makeGistSyncLink(siteUrl + '/', { gistId: result.gistId, token });
fs.writeFileSync(linkFile, link, 'utf8');
console.log('GitHub 私有 Gist 已初始化。');
console.log('站点：' + siteUrl + '/');
console.log('Gist ID：' + result.gistId);
console.log('导入旧记录：' + rows.length + ' 天');
console.log('同步链接已写入项目内 .sync-link（不会进入 Git 仓库）。');
