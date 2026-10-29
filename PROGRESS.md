# 进度记录

## 已完成

- 从 Edge LevelDB 只读快照恢复电脑版 4 天记录（2026-10-23、24、25、27）。
- 完成手机优先三分栏 UI：今天 / 足迹 / 同步。
- 完成 IndexedDB 本地存储、导出与导入。
- 完成 PWA manifest、图标和 Service Worker 离线缓存。
- 按用户要求从 Netlify 切换为 GitHub Pages。
- 完成私有 GitHub Gist 同步客户端和删除墓碑合并。
- 完成旧记录初始化与线上检查脚本。
- GitHub Pages 自动发布工作流已写入。

## 当前验证结果

- 纯逻辑、Gist 同步、真浏览器与离线测试全部通过。
- 真浏览器截图：`artifacts/e2e-mobile.png`。
- 三设备同步与墓碑删除：通过。

## 待完成

- [ ] 创建 GitHub 公开仓库并推送
- [ ] 启用 GitHub Pages 工作流并等待首次部署
- [ ] 创建仅含 gist 权限的专用 GitHub 令牌
- [ ] 创建私有 Gist 并导入旧记录
- [ ] 线上 200 与 Gist 同步实测
- [ ] 生成手机二维码
- [ ] 创建电脑端“同步版”快捷方式

## 安全边界

- 公开仓库只放 App 源码，不放用户记录或 GitHub 令牌。
- `.github-sync-token`、`.sync-config.json`、`.sync-link` 均在 `.gitignore` 中。
- 同步链接包含访问令牌，只能发给自己的设备。
