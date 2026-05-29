# Desktop App

Tauri 桌面客户端。当前 React/Vite 代码是 Tauri WebView UI 层，不是最终的 Web 站点交付形态。Rust 工具链安装后，使用 `src-tauri` 将 UI 包进桌面壳，再继续接入 Rust 侧播放器、文件匹配、WebRTC、SQLite 本地状态模块。

第一阶段目标：

- 单机本地视频播放。
- mpv/libmpv 控制适配层。
- 播放控制栏。
- `.srt/.vtt` 字幕加载和字幕偏移。
- 快捷键。
- 全屏和倍速控制。

## 开发命令

```powershell
npm.cmd run dev
npm.cmd run tauri:dev
npm.cmd run build
npm.cmd test
```

当前环境如果没有 `rustc` / `cargo`，只能运行 Vite UI 和单元测试，不能执行 `tauri:dev` 或 `tauri:build`。

## 桌面端边界

- `src/`：Tauri WebView UI，负责现代化播放器界面和同步状态。
- `src-tauri/`：桌面壳、系统权限、后续 Rust 播放器适配。
- 后续 mpv/libmpv 应放在 Rust adapter 内，而不是把 Web `<video>` 当最终播放内核。
