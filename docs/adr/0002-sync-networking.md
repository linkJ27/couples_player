# ADR 0002：同步网络架构

## 状态

Accepted

## 背景

产品需要远程同步播放，但不需要传输视频内容。同步消息体积小、延迟敏感，同时需要支持 NAT 环境和断线重连。

## 决策

采用：

- WebSocket 作为房间和信令通道。
- WebRTC DataChannel 作为优先的客户端间控制通道。
- STUN + TURN 作为连接兜底。
- 服务端保存短期房间状态用于重连恢复。

## 理由

- WebSocket 适合房间 presence、session、信令和状态恢复。
- WebRTC DataChannel 延迟低，适合点对点播放控制。
- TURN 可覆盖 P2P 打洞失败场景。
- 不转发视频能显著降低服务端成本和法律/隐私风险。

## 影响

- 服务端仍需要部署 TURN。
- 同步协议必须能在 WebRTC 和 WebSocket fallback 上运行。
- 重连逻辑需要区分 session 恢复和新成员加入。

