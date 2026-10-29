import fs from 'node:fs';
import { generateSyncCode, isValidSyncCode, makeSyncLink } from '../src/core.js';
import { syncWithCloud } from '../src/sync-client.js';

const siteUrl = (process.argv[2] || '').replace(/\/+$/, '');
const workerUrl = (process.argv[3] || '').trim();
if (!/^https:\/\//.test(siteUrl) || !/^https:\/\//.test(workerUrl)) {
  console.error('用法：node scripts/init-sync.mjs https://用户名.github.io/仓库名/ https://同步Worker地址/');
  process.exit(2);
}
const codeFile = new URL('../.sync-code', import.meta.url);
const linkFile = new URL('../.sync-link', import.meta.url);
if (fs.existsSync(codeFile) && !process.argv.includes('--new')) {
  console.error('已存在 .sync-code。若要生成新同步码，请加 --new。');
  process.exit(2);
}
const code = generateSyncCode(null, 20);
if (!isValidSyncCode(code)) throw new Error('生成的同步码格式不正确');
fs.writeFileSync(codeFile, code, 'utf8');
const rows = JSON.parse(fs.readFileSync(new URL('../data/migration-entries.json', import.meta.url), 'utf8'));
await syncWithCloud(code, rows, undefined, workerUrl);
const link = makeSyncLink(siteUrl + '/', code);
fs.writeFileSync(linkFile, link, 'utf8');
console.log('同步空间已初始化。');
console.log('站点：' + siteUrl + '/');
console.log('旧记录：' + rows.length + ' 天');
console.log('同步码和链接已写入项目内 .sync-code / .sync-link（不会进入 Git 仓库）。');
