# 进步记录本手机版

手机优先的每日进步记录 App。每晚写下一件真实的收获，用成长星轨、连续记录和月历热量看见自己的积累。

## 直接使用

1. 用手机相机扫描交付时提供的二维码。
2. 浏览器菜单选择“添加到主屏幕”。
3. 首次通过同步链接进入会自动连接你的私人同步空间。
4. 每晚写下今天的收获，点“收好今天的进步”。

## 数据与同步

- App 静态页面部署在 GitHub Pages。
- 记录保存在设备本地的 IndexedDB，可完整离线使用。
- 跨设备同步使用 Cloudflare Worker + D1，只同步日期、标题、正文、标签与时间戳。
- 不同步图片、位置、联系人或设备标识。
- 手机和电脑输入同一组 20 位同步码即可共享记录。
- 同步码是私密钥匙，不会写入公开仓库；拿到同步码的人可以读写该空间。
- 删除采用墓碑机制，不会在另一台设备上“复活”。
- 可在“同步 → 备份与恢复”导出完整 JSON 备份。

## 开发与测试

```powershell
cd D:\Codex\进步记录本手机版
node tools/make-icons.mjs
node scripts/build_site.mjs
node --test
```

测试覆盖：
- 旧版记录迁移
- 同日记录按更新时间合并
- 删除墓碑与跨设备合并
- 手机 375×812 主流程
- 刷新后数据保留
- 真断网重开
- 三设备模拟同步

## 本地预览

```powershell
node scripts/serve.mjs --root dist --port 8123
```

打开 `http://127.0.0.1:8123/`。

## 发布静态站

代码推送到 GitHub 后，`.github/workflows/pages.yml` 会自动构建并发布 `dist/`。

```powershell
git push origin main
gh run list --workflow pages.yml
```

## 同步后端

```powershell
cd D:\Codex\进步记录本手机版\cloudflare
npx --yes wrangler@latest login
npx --yes wrangler@latest whoami
npx --yes wrangler@latest d1 create progress-notebook-db
npx --yes wrangler@latest d1 execute progress-notebook-db --remote --command "CREATE TABLE IF NOT EXISTS progress_spaces (code TEXT PRIMARY KEY, rev INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, data TEXT NOT NULL);"
npx --yes wrangler@latest deploy
```

把 Worker 地址写入 `src/config.js`，然后重新构建发布。

## 同步初始化

```powershell
node scripts/init-sync.mjs https://2805303591cxz-svg.github.io/progress-notebook-mobile/ https://progress-notebook-sync.progress-cxz-280530.workers.dev/
```

同步码和同步链接分别写入 `.sync-code`、`.sync-link`，这两个文件已加入 `.gitignore`。

## 项目结构

```text
src/           App 源码、Service Worker、manifest、图标
cloudflare/    Worker + D1 同步后端
tests/         纯逻辑、同步与真浏览器测试
data/          旧版迁移快照（不会进入公开 dist）
scripts/       构建、测试、线上检查脚本
artifacts/     真浏览器截图
docs/          方法与功能红线
.github/       GitHub Pages 自动发布工作流
```

## 有意没做

- 不做账号、社区、排行榜和积分。
- 不做图片/语音日记。
- 不做后台定时推送；PWA 在完全退出后无法稳定执行本地定时通知。
