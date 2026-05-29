# 系统架构

## 总体架构

```text
Desktop Client A                  Signaling Service                 Desktop Client B
----------------                  -----------------                 ----------------
Tauri Shell                       Room Registry                     Tauri Shell
React UI                          Presence                          React UI
Rust Core                         WebSocket                         Rust Core
mpv/libmpv                        SDP/ICE Relay                     mpv/libmpv
Sync Engine                       Session Resume                    Sync Engine
File Matcher                      TURN Config                       File Matcher
WebRTC DataChannel   <-------->   No Media Storage    <-------->    WebRTC DataChannel
```

服务端只处理房间、在线状态、信令和重连，不保存视频内容。客户端之间优先走 WebRTC DataChannel 同步控制事件；P2P 失败时仍可临时通过 WebSocket 转发控制事件，但不会转发视频。

## 客户端模块

### UI Layer

- 房间创建、加入、连接状态。
- 播放器控制栏。
- 文件匹配状态。
- 播放列表。
- 字幕偏移面板。
- 表情反应面板。
- 快捷键绑定。

### Player Adapter

封装 mpv/libmpv 控制能力：

- `loadFile(path)`
- `play()`
- `pause()`
- `seek(seconds, mode)`
- `setPlaybackRate(rate)`
- `getPosition()`
- `getDuration()`
- `setSubtitleOffset(ms)`
- `nextPlaylistItem()`

播放器状态统一上报给 Sync Engine，避免 UI 直接广播播放器事件。

### Sync Engine

负责同步状态机：

- 接收本地控制命令。
- 生成房间命令。
- 应用远端命令。
- 维护权威播放时间轴。
- 做延迟估算、漂移修正和冲突处理。

### File Matcher

三级匹配：

1. 快速元数据：文件名、大小、时长、分辨率、编码信息。
2. 分段指纹：头部、中段、尾部多个 chunk 的 hash。
3. 严格校验：用户手动触发全文件 hash。

文件路径只保存在本机，不进入房间状态。

### Playlist Engine

- 房间级队列。
- 本地路径绑定。
- 剧集识别。
- 自动下一集。
- 缺失文件提示。

### Reaction Engine

表情反应走独立轻量消息，不能阻塞播放命令。第一版只做实时表情，后续可做时间轴回放。

## 服务端模块

### Room Registry

- 创建房间码。
- 房间短期有效。
- 维护成员和角色。
- 保存最近权威状态用于重连恢复。

### WebSocket Gateway

- 客户端认证为临时 session。
- 转发 WebRTC SDP/ICE。
- 连接断开后保留 session 窗口。

### TURN 配置

第一版部署 coturn。WebRTC 直连失败时走 TURN 中继，仍只传控制数据。

## 数据持久化

第一版尽量减少持久化：

- 服务端：房间短期状态，Redis 即可。
- 客户端：本地设置、播放列表绑定、最近房间，可用 SQLite。
- 不保存视频路径到服务端。

