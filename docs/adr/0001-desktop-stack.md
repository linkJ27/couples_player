# ADR 0001：桌面端技术栈

## 状态

Accepted

## 背景

第一版需要稳定播放本地视频，并支持系统文件访问、快捷键、字幕、播放列表、网络同步和后续打包发布。纯 Web 播放器对本地文件、字幕、多格式支持和桌面体验都有明显限制。

## 决策

桌面端采用：

- Tauri v2。
- Rust core。
- React + TypeScript UI。
- mpv/libmpv 或 mpv IPC 播放内核。

## 理由

- Tauri 安装包更小，系统集成和本地能力明确。
- Rust 适合实现文件指纹、网络同步、SQLite 状态和播放器适配。
- React + TypeScript 有利于快速构建复杂 UI。
- mpv 对本地视频格式支持比浏览器 `<video>` 更可靠。

## 影响

- 需要处理 mpv 依赖分发。
- Rust 与前端之间需要清晰的命令边界。
- 播放器状态必须通过 adapter 层统一进入同步引擎，避免 UI 和 mpv 状态分裂。

