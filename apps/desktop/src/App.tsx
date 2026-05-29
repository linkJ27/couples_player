import {
  Captions,
  Clapperboard,
  Clock3,
  FastForward,
  FileVideo,
  Heart,
  Link2,
  ListVideo,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  SmilePlus,
  Users,
  Volume2
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyDrift, createPlaybackSnapshot } from "@couples-player/protocol";
import {
  createPlaylistItems,
  formatBytes,
  formatTime,
  inferNextEpisodeIndex,
  type PlaylistItem
} from "./media";
import { useRoomSync } from "./useRoomSync";

interface ReactionBurst {
  id: string;
  emoji: string;
}

const reactions = ["❤️", "😂", "😮", "🥹", "👏"];

export function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [roomCode, setRoomCode] = useState(() => createRoomCode());
  const [autoNext, setAutoNext] = useState(true);
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const roomSync = useRoomSync(roomCode);

  const activeItem = playlist[activeIndex] ?? null;
  const isRoomLeader = roomSync.leaderId === roomSync.memberId;
  const canControlPlayback =
    roomSync.connectionState !== "connected" || roomSync.roomMode === "free" || isRoomLeader;
  const driftMs = isPlaying ? 126 : 34;
  const correction = classifyDrift(driftMs);
  const snapshot = useMemo(
    () =>
      createPlaybackSnapshot({
        state: isPlaying ? "playing" : activeItem ? "paused" : "idle",
        mediaId: activeItem?.id ?? null,
        mediaTimeMs: currentTime * 1000,
        roomTimeMs: Math.round(performance.now()),
        playbackRate,
        leaderId: roomSync.leaderId ?? roomSync.memberId
      }),
    [activeItem, currentTime, isPlaying, playbackRate, roomSync.leaderId, roomSync.memberId]
  );

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setPlaylist((previous) => {
      previous.forEach((item) => URL.revokeObjectURL(item.url));
      return createPlaylistItems(files);
    });
    setActiveIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const makeSnapshot = useCallback(
    (state: "playing" | "paused", mediaTimeSeconds = videoRef.current?.currentTime ?? currentTime) =>
      createPlaybackSnapshot({
        state,
        mediaId: activeItem?.id ?? null,
        mediaTimeMs: mediaTimeSeconds * 1000,
        roomTimeMs: Math.round(performance.now()),
        playbackRate,
        leaderId: roomSync.leaderId ?? roomSync.memberId
      }),
    [activeItem?.id, currentTime, playbackRate, roomSync.leaderId, roomSync.memberId]
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !activeItem || !canControlPlayback) {
      return;
    }

    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
  }, [activeItem, canControlPlayback]);

  const jumpBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !canControlPlayback) {
      return;
    }

    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  }, [canControlPlayback]);

  const selectItem = (index: number) => {
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  };

  const goNext = useCallback(() => {
    if (!canControlPlayback) {
      return;
    }

    const nextIndex = inferNextEpisodeIndex(playlist, activeIndex);
    if (nextIndex >= 0) {
      selectItem(nextIndex);
    }
  }, [activeIndex, canControlPlayback, playlist]);

  const sendReaction = (emoji: string) => {
    const id = `${Date.now()}-${emoji}`;
    setBursts((current) => [...current, { id, emoji }]);
    roomSync.broadcastReaction({
      reactionId: id,
      senderId: roomSync.memberId,
      emoji,
      mediaTimeMs: Math.round(currentTime * 1000),
      createdRoomTimeMs: Math.round(performance.now())
    });
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 1800);
  };

  const broadcastCurrentPlayback = useCallback(
    (state: "playing" | "paused", mediaTimeSeconds?: number) => {
      roomSync.broadcastPlayback(makeSnapshot(state, mediaTimeSeconds));
    },
    [makeSnapshot, roomSync]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.playbackRate = playbackRate;
  }, [playbackRate, volume]);

  useEffect(() => {
    const event = roomSync.lastRemoteReaction;
    if (!event) {
      return;
    }

    const id = `${event.reaction.reactionId}-remote`;
    setBursts((current) => [...current, { id, emoji: event.reaction.emoji }]);
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 1800);
  }, [roomSync.lastRemoteReaction]);

  useEffect(() => {
    const event = roomSync.lastRemotePlayback;
    const video = videoRef.current;
    if (!event || !video || event.snapshot.mediaId !== activeItem?.id) {
      return;
    }

    const targetSeconds = event.snapshot.anchorMediaTimeMs / 1000;
    if (Math.abs(video.currentTime - targetSeconds) > 0.25) {
      video.currentTime = targetSeconds;
    }

    if (event.snapshot.state === "playing" && video.paused) {
      void video.play();
    }

    if (event.snapshot.state === "paused" && !video.paused) {
      video.pause();
    }
  }, [activeItem?.id, roomSync.lastRemotePlayback]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      }

      if (event.key === "ArrowRight") {
        jumpBy(10);
      }

      if (event.key === "ArrowLeft") {
        jumpBy(-10);
      }

      if (event.key === "]") {
        setSubtitleOffsetMs((value) => value + 100);
      }

      if (event.key === "[") {
        setSubtitleOffsetMs((value) => value - 100);
      }

      if (event.key.toLowerCase() === "n") {
        goNext();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, jumpBy, togglePlayback]);

  useEffect(() => {
    return () => playlist.forEach((item) => URL.revokeObjectURL(item.url));
  }, [playlist]);

  return (
    <main className="app-shell">
      <section className="player-zone">
        <header className="topbar">
          <div>
            <p className="eyebrow">Private room</p>
            <h1>Couples Player</h1>
          </div>
          <div className="room-pill" title="房间码">
            <Link2 size={17} />
            <input
              aria-label="房间码"
              value={roomCode}
              onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
            />
          </div>
        </header>

        <div className="video-stage">
          {activeItem ? (
            <video
              ref={videoRef}
              src={activeItem.url}
              onPause={() => {
                setIsPlaying(false);
                broadcastCurrentPlayback("paused");
              }}
              onPlay={() => {
                setIsPlaying(true);
                broadcastCurrentPlayback("playing");
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const nextDuration = event.currentTarget.duration || 0;
                setDuration(nextDuration);
                setPlaylist((items) =>
                  items.map((item, index) =>
                    index === activeIndex ? { ...item, durationMs: nextDuration * 1000 } : item
                  )
                );
              }}
              onEnded={() => {
                setIsPlaying(false);
                broadcastCurrentPlayback("paused");
                if (autoNext) {
                  goNext();
                }
              }}
              controls={false}
            />
          ) : (
            <div className="empty-stage">
              <Clapperboard size={54} />
              <h2>选择本地视频开始</h2>
              <p>视频只保留在你的设备上，房间只同步播放状态和轻量互动。</p>
              <button className="primary-action" onClick={() => fileInputRef.current?.click()}>
                <FileVideo size={18} />
                选择视频
              </button>
            </div>
          )}

          <div className="reaction-layer" aria-live="polite">
            {bursts.map((burst) => (
              <span className="reaction-burst" key={burst.id}>
                {burst.emoji}
              </span>
            ))}
          </div>
        </div>

        <div className="control-deck">
          <div className="timeline">
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              disabled={!canControlPlayback}
              onChange={(event) => {
                const nextTime = Number(event.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = nextTime;
                }
                setCurrentTime(nextTime);
                broadcastCurrentPlayback(isPlaying ? "playing" : "paused", nextTime);
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="button-row">
            <button title="快退 10 秒" onClick={() => jumpBy(-10)} disabled={!activeItem || !canControlPlayback}>
              <FastForward className="flip" size={18} />
            </button>
            <button
              className="play-button"
              onClick={() => void togglePlayback()}
              disabled={!activeItem || !canControlPlayback}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button title="快进 10 秒" onClick={() => jumpBy(10)} disabled={!activeItem || !canControlPlayback}>
              <FastForward size={18} />
            </button>
            <button title="下一集" onClick={goNext} disabled={playlist.length < 2 || !canControlPlayback}>
              <SkipForward size={18} />
            </button>
            <label className="volume-control" title="本地音量独立控制">
              <Volume2 size={18} />
              <input
                aria-label="音量"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </label>
          </div>
        </div>
      </section>

      <aside className="side-panel">
        <section className="panel-block">
          <div className="panel-heading">
            <Users size={18} />
            <h2>同步状态</h2>
          </div>
          <div className="connection-row">
            <button
              className={roomSync.connectionState === "connected" ? "selected" : ""}
              onClick={roomSync.connectionState === "connected" ? roomSync.disconnect : roomSync.connect}
            >
              {roomSync.connectionState === "connected" ? "断开房间" : "连接房间"}
            </button>
            <span>{roomSync.peerCount} 人在线</span>
          </div>
          <div className="mode-grid">
            <button
              className={roomSync.roomMode === "leader" ? "selected" : ""}
              onClick={() => roomSync.setRoomMode("leader")}
              disabled={roomSync.connectionState === "connected" && !isRoomLeader}
            >
              主控
            </button>
            <button
              className={roomSync.roomMode === "free" ? "selected" : ""}
              onClick={() => roomSync.setRoomMode("free")}
              disabled={roomSync.connectionState === "connected" && !isRoomLeader}
            >
              自由
            </button>
          </div>
          <button className="leader-action" onClick={roomSync.claimLeader}>
            {isRoomLeader ? "我是主控" : "申请主控"}
          </button>
          <dl className="status-list">
            <div>
              <dt>延迟</dt>
              <dd>{roomSync.latencyMs ?? "--"} ms</dd>
            </div>
            <div>
              <dt>漂移</dt>
              <dd>{driftMs} ms</dd>
            </div>
            <div>
              <dt>校准</dt>
              <dd>{correction.correction}</dd>
            </div>
            <div>
              <dt>连接</dt>
              <dd>{roomSync.connectionState}</dd>
            </div>
            <div>
              <dt>主控</dt>
              <dd>{isRoomLeader ? "me" : roomSync.leaderId ? "peer" : "--"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel-block">
          <div className="panel-heading">
            <FileVideo size={18} />
            <h2>本地文件</h2>
          </div>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="video/*"
            multiple
            onChange={handleFiles}
          />
          <button className="secondary-action" onClick={() => fileInputRef.current?.click()}>
            <FileVideo size={17} />
            添加视频
          </button>
          {activeItem ? (
            <div className="file-match">
              <strong>{activeItem.name}</strong>
              <span>{formatBytes(activeItem.size)}</span>
              <small>{activeItem.id}</small>
            </div>
          ) : (
            <p className="muted">还没有选择视频。</p>
          )}
        </section>

        <section className="panel-block">
          <div className="panel-heading">
            <Captions size={18} />
            <h2>字幕</h2>
          </div>
          <div className="stepper">
            <button onClick={() => setSubtitleOffsetMs((value) => value - 100)}>-100</button>
            <span>{subtitleOffsetMs} ms</span>
            <button onClick={() => setSubtitleOffsetMs((value) => value + 100)}>+100</button>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-heading">
            <ListVideo size={18} />
            <h2>播放列表</h2>
          </div>
          <label className="switch-line">
            <input type="checkbox" checked={autoNext} onChange={(event) => setAutoNext(event.target.checked)} />
            <span>自动下一集</span>
          </label>
          <div className="playlist">
            {playlist.length === 0 ? (
              <p className="muted">队列为空。</p>
            ) : (
              playlist.map((item, index) => (
                <button
                  className={index === activeIndex ? "playlist-item selected" : "playlist-item"}
                  key={`${item.id}-${index}`}
                  onClick={() => selectItem(index)}
                >
                  <span>{item.name}</span>
                  <small>{item.durationMs ? formatTime(item.durationMs / 1000) : formatBytes(item.size)}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-heading">
            <SmilePlus size={18} />
            <h2>同步表情</h2>
          </div>
          <div className="reaction-grid">
            {reactions.map((emoji) => (
              <button key={emoji} onClick={() => sendReaction(emoji)} title={`发送 ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-block compact">
          <div className="panel-heading">
            <Clock3 size={18} />
            <h2>房间快照</h2>
          </div>
          <code>
            v{snapshot.version} · {snapshot.state} · {Math.round(snapshot.anchorMediaTimeMs)}ms
          </code>
          <div className="sync-chip">
            <RefreshCw size={14} />
            <span>{roomSync.roomMode === "leader" ? "权威时间轴" : "冲突排序"}</span>
          </div>
        </section>

        <section className="panel-block compact">
          <div className="panel-heading">
            <Heart size={18} />
            <h2>快捷键</h2>
          </div>
          <p className="muted">Space 播放 · ←/→ 快退快进 · [ ] 字幕偏移 · N 下一集</p>
        </section>
      </aside>
    </main>
  );
}

function createRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}
