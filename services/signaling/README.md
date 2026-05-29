# Signaling Service

房间和 WebRTC 信令服务。建议使用 Rust Axum + WebSocket，第一版用 Redis 保存短期房间状态。

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

