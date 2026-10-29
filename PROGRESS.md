# 进度记录

## 已完成

- 从 Edge LevelDB 只读快照恢复电脑版 4 天记录（2026-10-23、24、25、27）。
- 完成手机优先三分栏 UI：今天 / 足迹 / 同步。
- 完成 IndexedDB 本地存储、导出与导入。
- 完成 PWA manifest、图标和 Service Worker 离线缓存。
- 完成 GitHub Pages 发布工作流。
- 完成 Cloudflare Worker + D1 同步后端。
- 已创建 D1 数据库、建表并部署 Worker。
- 旧记录已写入用户私人同步空间并验证可读取。
- 手机主流程、刷新持久化、断网重开、三设备同步测试全部通过。

## 当前地址

- App：https://2805303591cxz-svg.github.io/progress-notebook-mobile/
- 同步后端：https://progress-notebook-sync.progress-cxz-280530.workers.dev/

## 待完成

- [ ] 将最新代码和同步地址重新发布到 GitHub Pages
- [ ] 线上 App 双端同步实测
- [ ] 生成手机二维码
- [ ] 创建电脑端“同步版”快捷方式
- [ ] 更新 Skill 模板为 D1 强一致版本

## 安全边界

- 公开仓库只放 App 源码，不放用户记录或同步码。
- `data/`、`.sync-code`、`.sync-link`、测试快照均在 `.gitignore` 中。
