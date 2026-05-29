# 同步协议

## 设计目标

- 把播放状态建模为一条可推导的时间轴，而不是频繁广播当前秒数。
- 大命令可靠有序，小互动低延迟。
- 断线重连后能从权威状态恢复。
- 支持主控模式和自由模式。

## 房间状态

```json
{
  "roomId": "A1B2C3",
  "epoch": 3,
  "mode": "leader",
  "leaderId": "client-a",
  "mediaId": "blake3:...",
  "playlistVersion": 12,
  "playback": {
    "version": 42,
    "state": "playing",
    "anchorMediaTimeMs": 123456,
    "anchorRoomTimeMs": 99887766,
    "playbackRate": 1.0
  }
}
```

`epoch` 在成员重连、主控切换、播放项切换时递增。客户端收到旧 epoch 命令时直接丢弃。

## 播放命令

```json
{
  "type": "playback.command",
  "commandId": "01H...",
  "roomId": "A1B2C3",
  "senderId": "client-a",
  "epoch": 3,
  "logicalClock": 17,
  "issuedRoomTimeMs": 99887000,
  "action": "seek",
  "payload": {
    "targetMediaTimeMs": 120000
  }
}
```

动作集合：

- `play`
- `pause`
- `seek`
- `set_rate`
- `load_media`
- `next_item`
- `previous_item`

## 时间同步

客户端和房间维护一个估算关系：

```text
roomTime = localMonotonicTime + offset
```

通过 ping/pong 估算 RTT 和 offset：

```text
offset = remoteTime - (localSend + rtt / 2)
```

播放中目标位置：

```text
targetMediaTime = anchorMediaTime + (localRoomTime - anchorRoomTime) * playbackRate
```

## 漂移修正

建议阈值：

- `0-80ms`：忽略。
- `80-250ms`：临时微调播放速度。
- `>250ms`：seek 到目标位置。

微调策略：

```text
drift > 0: setRate(1.03)
drift < 0: setRate(0.97)
abs(drift) < 40ms: restoreRate(originalRate)
```

实际阈值应暴露为内部配置，方便调试。

## 主控模式

只有 leader 可以发权威播放命令。其他人发起：

```json
{
  "type": "control.request",
  "requestId": "01H...",
  "requestedAction": "seek",
  "payload": {
    "targetMediaTimeMs": 120000
  }
}
```

leader 接受后转成 `playback.command`。

## 自由模式

所有成员可发播放命令，冲突处理规则：

1. 不同 epoch：高 epoch 胜出。
2. 同 epoch：高 logicalClock 胜出。
3. 同 logicalClock：按 senderId 稳定排序。
4. seek 后设置短暂控制锁，默认 1500ms。

## 播放列表协议

```json
{
  "type": "playlist.update",
  "playlistVersion": 12,
  "items": [
    {
      "mediaId": "blake3:...",
      "displayName": "Show.S01E02.mkv",
      "durationMs": 2640000,
      "sizeBytes": 734003200,
      "episodeKey": {
        "season": 1,
        "episode": 2
      }
    }
  ]
}
```

本地路径映射只在客户端保存：

```json
{
  "mediaId": "blake3:...",
  "localPath": "D:\\Videos\\Show.S01E02.mkv"
}
```

## 表情反应协议

```json
{
  "type": "reaction.send",
  "reactionId": "01H...",
  "senderId": "client-a",
  "emoji": "heart",
  "mediaTimeMs": 123456,
  "createdRoomTimeMs": 99887766
}
```

表情不参与播放状态一致性，不做强重试。

