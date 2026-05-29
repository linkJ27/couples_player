# Signaling Service

房间和 WebRTC 信令服务。建议使用 Rust Axum + WebSocket，第一版用 Redis 保存短期房间状态。

当前实现先提供 Node.js/TypeScript 版最小 WebSocket 房间广播服务，方便前端快速验证同步播放命令。后续可以按架构文档迁移到 Rust Axum。
它已经包含房间成员、主控/自由模式、播放快照、房间播放列表、媒体 presence 聚合、表情广播、ping/pong 延迟测量和短断线恢复窗口。

```powershell
npm.cmd run dev:signaling
```

默认监听：

```text
ws://127.0.0.1:8787
http://127.0.0.1:8787/health
```

职责：

- 创建和加入房间。
- 维护 session 和 presence。
- 转发 SDP/ICE。
- 保存短期权威播放状态用于重连恢复。
- 下发 STUN/TURN 配置。

不负责：

- 存储视频。
- 转发视频。
- 解析网盘或资源站。
