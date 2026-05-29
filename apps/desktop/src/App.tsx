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
import { classifyDrift, createPlaybackSnapshot, type RoomMode } from "@couples-player/protocol";
import {
  createPlaylistItems,
  formatBytes,
  formatTime,
  inferNextEpisodeIndex,
  type PlaylistItem
} from "./media";

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
  const [roomCode] = useState(() => createRoomCode());
  const [roomMode, setRoomMode] = useState<RoomMode>("leader");
  const [isLeader, setIsLeader] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);

  const activeItem = playlist[activeIndex] ?? null;
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
        leaderId: "local-client"
      }),
    [activeItem, currentTime, isPlaying, playbackRate]
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

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !activeItem) {
      return;
    }

    if (video.paused) {
      await video.play();
    } else {
      video.pause();
    }
  }, [activeItem]);

  const jumpBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  }, []);

  const selectItem = (index: number) => {
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  };

  const goNext = useCallback(() => {
    const nextIndex = inferNextEpisodeIndex(playlist, activeIndex);
    if (nextIndex >= 0) {
      selectItem(nextIndex);
    }
  }, [activeIndex, playlist]);

  const sendReaction = (emoji: string) => {
    const id = `${Date.now()}-${emoji}`;
    setBursts((current) => [...current, { id, emoji }]);
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 1800);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.playbackRate = playbackRate;
  }, [playbackRate, volume]);

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
            <span>{roomCode}</span>
          </div>
        </header>

        <div className="video-stage">
          {activeItem ? (
            <video
              ref={videoRef}
              src={activeItem.url}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
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
              onChange={(event) => {
                const nextTime = Number(event.target.value);
                if (videoRef.current) {
                  videoRef.current.currentTime = nextTime;
                }
                setCurrentTime(nextTime);
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="button-row">
            <button title="快退 10 秒" onClick={() => jumpBy(-10)} disabled={!activeItem}>
              <FastForward className="flip" size={18} />
            </button>
            <button className="play-button" onClick={() => void togglePlayback()} disabled={!activeItem}>
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button title="快进 10 秒" onClick={() => jumpBy(10)} disabled={!activeItem}>
              <FastForward size={18} />
            </button>
            <button title="下一集" onClick={goNext} disabled={playlist.length < 2}>
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
          <div className="mode-grid">
            <button
              className={roomMode === "leader" ? "selected" : ""}
              onClick={() => setRoomMode("leader")}
            >
              主控
            </button>
            <button className={roomMode === "free" ? "selected" : ""} onClick={() => setRoomMode("free")}>
              自由
            </button>
          </div>
          <label className="switch-line">
            <input type="checkbox" checked={isLeader} onChange={(event) => setIsLeader(event.target.checked)} />
            <span>{isLeader ? "我是主控" : "跟随对方"}</span>
          </label>
          <dl className="status-list">
            <div>
              <dt>延迟</dt>
              <dd>48 ms</dd>
            </div>
            <div>
              <dt>漂移</dt>
              <dd>{driftMs} ms</dd>
            </div>
            <div>
              <dt>校准</dt>
              <dd>{correction.correction}</dd>
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
            <span>{roomMode === "leader" ? "权威时间轴" : "冲突排序"}</span>
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

