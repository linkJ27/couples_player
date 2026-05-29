# Couples Player

情侣本地同步播放器，第一版目标是让两个人在各自设备上选择同一份本地视频，通过房间连接实现同步播放、文件匹配、断线重连、延迟校准、播放列表、下一集和同步表情反应。

## MVP 功能

- 房间同步播放：播放、暂停、seek、倍速、切集同步。
- 本地文件匹配：通过文件元数据、媒体信息和分段指纹确认双方文件一致。
- 断线重连：会话恢复后自动拉齐房间状态。
- 延迟校准：基于单调时钟和漂移修正保持播放进度一致。
- 主控 / 自由模式：支持主持人权威控制，也支持双方自由控制。
- 字幕偏移调整：字幕文件本地加载，偏移默认本地私有，可手动同步。
- 播放列表：房间级播放队列，支持自动和手动下一集。
- 音量独立控制：音量、窗口、字幕显示等保持本地私有。
- 快捷键：覆盖播放、seek、字幕偏移、全屏、下一集、主控申请。
- 同步表情反应：轻量实时表情，不影响播放同步链路。

## 推荐技术栈

- 桌面端：Tauri v2 + React + TypeScript + Rust。
- 播放内核：libmpv / mpv IPC，优先保证本地格式兼容性。
- 信令服务：Rust Axum + WebSocket。
- P2P 通道：WebRTC DataChannel，STUN + TURN 兜底。
- 协议：TypeScript/Rust 双端共享 JSON schema 或 protobuf。
- 文件指纹：BLAKE3 或 xxHash3 分段 hash。

## 当前实现

当前仓库已落地第一版 Tauri 桌面壳配置、React/TypeScript WebView UI 原型和共享同步协议包。现阶段用 Vite 单独运行 UI 方便开发验证；最终交付目标仍是 Tauri 桌面端，后续接入 mpv/libmpv 播放内核。
信令服务已经支持房间 presence、短断线恢复窗口、主控/自由模式、播放状态广播、房间播放列表同步、表情广播、媒体 presence 聚合和 ping/pong 延迟测量。
播放器 UI 已支持本地视频、`.srt/.vtt` 字幕加载、字幕偏移、全屏、倍速、播放列表和同步状态面板。

当前机器缺少 Rust 工具链时，`tauri:dev` 会失败在 `cargo metadata`，这是环境限制，不代表 Tauri 配置文件缺失。

```powershell
npm.cmd install
npm.cmd run dev:signaling
npm.cmd run dev
npm.cmd --workspace apps/desktop run tauri:dev
npm.cmd test
npm.cmd run build
```

本地开发默认地址：

- 播放器：`http://127.0.0.1:5173`
- 信令服务：`ws://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/health`

## 文档

- [产品与 MVP](docs/product-mvp.md)
- [系统架构](docs/architecture.md)
- [同步协议](docs/sync-protocol.md)
- [开发路线](docs/development-plan.md)
- [开发 Backlog](docs/backlog.md)
- [Roadmap](docs/roadmap.md)
- [隐私与安全边界](docs/security-privacy.md)
- [Git 工作流](docs/git-workflow.md)
- [技术决策记录](docs/adr/)

## 仓库结构

```text
apps/
  desktop/          # Tauri 桌面客户端
services/
  signaling/        # 房间、在线状态、WebRTC 信令服务
packages/
  protocol/         # 共享协议、schema、类型定义
docs/               # 设计与开发文档
```
