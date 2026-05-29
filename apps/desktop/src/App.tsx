import {
  Captions,
  Clapperboard,
  Clock3,
  FastForward,
  FileVideo,
  Gauge,
  Heart,
  Link2,
  ListVideo,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  SmilePlus,
  Users,
  Volume2
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculatePlaybackDrift, classifyDrift, createPlaybackSnapshot } from "@couples-player/protocol";
import type { DriftCorrection } from "@couples-player/protocol";
import {
  createPlaylistItems,
  createSegmentedFileFingerprint,
  createStrictFileFingerprint,
  countPeersWithMedia,
  formatBytes,
  formatTime,
  inferSequentialNextEpisodeIndex,
  toMediaPresence,
  toPlaylistEntries,
  type PlaylistItem
} from "./media";
import { createSubtitleTrack, isSubtitleFile, type SubtitleTrack } from "./subtitles";
import { useRoomSync } from "./useRoomSync";

interface ReactionBurst {
  id: string;
  emoji: string;
}

const reactions = ["❤️", "😂", "😮", "🥹", "👏"];

export function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement | null>(null);
  const fingerprintRunRef = useRef(0);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrack | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [driftMs, setDriftMs] = useState(0);
  const [driftCorrection, setDriftCorrection] = useState<DriftCorrection>("none");
  const [roomCode, setRoomCode] = useState(() => createRoomCode());
  const [autoNext, setAutoNext] = useState(true);
  const [isStrictHashing, setIsStrictHashing] = useState(false);
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const roomSync = useRoomSync(roomCode);

  const activeItem = playlist[activeIndex] ?? null;
  const isRoomLeader = roomSync.leaderId === roomSync.memberId;
  const canControlPlayback =
    roomSync.connectionState !== "connected" || roomSync.roomMode === "free" || isRoomLeader;
  const peerMatchCount = countPeersWithMedia(
    activeItem?.id ?? null,
    roomSync.roomSnapshot?.mediaPresence ?? [],
    roomSync.memberId
  );
  const peerNeedsCurrentMedia =
    roomSync.connectionState === "connected" && activeItem && roomSync.peerCount > 1 && peerMatchCount === 0;
  const roomPlaylist = roomSync.roomSnapshot?.playlist ?? [];
  const snapshot = useMemo(
    () =>
      createPlaybackSnapshot({
        state: isPlaying ? "playing" : activeItem ? "paused" : "idle",
        mediaId: activeItem?.id ?? null,
        mediaTimeMs: currentTime * 1000,
        roomTimeMs: Math.round(roomSync.getRoomTimeMs()),
        playbackRate,
        leaderId: roomSync.leaderId ?? roomSync.memberId
      }),
    [
      activeItem,
      currentTime,
      isPlaying,
      playbackRate,
      roomSync.getRoomTimeMs,
      roomSync.leaderId,
      roomSync.memberId
    ]
  );

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const runId = fingerprintRunRef.current + 1;
    fingerprintRunRef.current = runId;
    const nextItems = createPlaylistItems(files);
    setPlaylist((previous) => {
      previous.forEach((item) => URL.revokeObjectURL(item.url));
      return nextItems;
    });
    setActiveIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    for (const item of nextItems) {
      void createSegmentedFileFingerprint(item.file)
        .then((fingerprint) => {
          if (fingerprintRunRef.current !== runId) {
            return;
          }

          setPlaylist((current) =>
            current.map((currentItem) =>
              currentItem.url === item.url
                ? {
                    ...currentItem,
                    id: fingerprint.mediaId,
                    fingerprintConfidence: fingerprint.confidence,
                    fingerprintStatus: "ready"
                  }
                : currentItem
            )
          );
        })
        .catch(() => {
          if (fingerprintRunRef.current !== runId) {
            return;
          }

          setPlaylist((current) =>
            current.map((currentItem) =>
              currentItem.url === item.url ? { ...currentItem, fingerprintStatus: "error" } : currentItem
            )
          );
        });
    }
  };

  const handleSubtitle = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && isSubtitleFile(file)) {
      setSubtitleFile(file);
    }
  };

  const makeSnapshot = useCallback(
    (state: "playing" | "paused", mediaTimeSeconds = videoRef.current?.currentTime ?? currentTime) =>
      createPlaybackSnapshot({
        state,
        mediaId: activeItem?.id ?? null,
        mediaTimeMs: mediaTimeSeconds * 1000,
        roomTimeMs: Math.round(roomSync.getRoomTimeMs()),
        playbackRate,
        leaderId: roomSync.leaderId ?? roomSync.memberId
      }),
    [activeItem?.id, currentTime, playbackRate, roomSync.getRoomTimeMs, roomSync.leaderId, roomSync.memberId]
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

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    setPlaybackRate(rates[(currentIndex + 1) % rates.length]);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await stageRef.current?.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  };

  const selectItem = (index: number) => {
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  };

  const verifyActiveFile = useCallback(async () => {
    if (!activeItem || isStrictHashing) {
      return;
    }

    const itemUrl = activeItem.url;
    setIsStrictHashing(true);
    setPlaylist((current) =>
      current.map((item) => (item.url === itemUrl ? { ...item, fingerprintStatus: "hashing" } : item))
    );

    try {
      const fingerprint = await createStrictFileFingerprint(activeItem.file);
      setPlaylist((current) =>
        current.map((item) =>
          item.url === itemUrl
            ? {
                ...item,
                id: fingerprint.mediaId,
                fingerprintConfidence: fingerprint.confidence,
                fingerprintStatus: "ready"
              }
            : item
        )
      );
    } catch {
      setPlaylist((current) =>
        current.map((item) => (item.url === itemUrl ? { ...item, fingerprintStatus: "error" } : item))
      );
    } finally {
      setIsStrictHashing(false);
    }
  }, [activeItem, isStrictHashing]);

  const goNext = useCallback(() => {
    if (!canControlPlayback) {
      return;
    }

    const nextIndex = inferSequentialNextEpisodeIndex(playlist, activeIndex);
    const nextItem = playlist[nextIndex] ?? null;
    const peerHasNext =
      roomSync.connectionState !== "connected" ||
      roomSync.peerCount <= 1 ||
      countPeersWithMedia(nextItem?.id ?? null, roomSync.roomSnapshot?.mediaPresence ?? [], roomSync.memberId) > 0;

    if (!peerHasNext) {
      return;
    }

    if (nextIndex >= 0) {
      selectItem(nextIndex);
    }
  }, [activeIndex, canControlPlayback, playlist, roomSync.connectionState, roomSync.memberId, roomSync.peerCount, roomSync.roomSnapshot?.mediaPresence]);

  const sendReaction = (emoji: string) => {
    const id = `${Date.now()}-${emoji}`;
    setBursts((current) => [...current, { id, emoji }]);
    roomSync.broadcastReaction({
      reactionId: id,
      senderId: roomSync.memberId,
      emoji,
      mediaTimeMs: Math.round(currentTime * 1000),
      createdRoomTimeMs: Math.round(roomSync.getRoomTimeMs())
    });
    window.setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 1800);
  };

  const broadcastCurrentPlayback = useCallback(
    (state: "playing" | "paused", mediaTimeSeconds?: number) => {
      roomSync.broadcastPlayback(makeSnapshot(state, mediaTimeSeconds));
    },
    [makeSnapshot, roomSync.broadcastPlayback]
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
    let disposed = false;

    async function loadSubtitle() {
      if (!subtitleFile) {
        setSubtitleTrack((current) => {
          if (current) {
            URL.revokeObjectURL(current.url);
          }
          return null;
        });
        return;
      }

      const nextTrack = await createSubtitleTrack(subtitleFile, subtitleOffsetMs);
      if (disposed) {
        URL.revokeObjectURL(nextTrack.url);
        return;
      }

      setSubtitleTrack((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
        }
        return nextTrack;
      });
    }

    void loadSubtitle();

    return () => {
      disposed = true;
    };
  }, [subtitleFile, subtitleOffsetMs]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (roomSync.connectionState === "connected") {
      roomSync.broadcastMediaPresence(toMediaPresence(playlist));
      if (canControlPlayback) {
        roomSync.broadcastPlaylist(toPlaylistEntries(playlist));
      }
    }
  }, [
    canControlPlayback,
    playlist,
    roomSync.broadcastMediaPresence,
    roomSync.broadcastPlaylist,
    roomSync.connectionState
  ]);

  useEffect(() => {
    if (!isPlaying || !activeItem || !canControlPlayback || roomSync.connectionState !== "connected") {
      return;
    }

    const intervalId = window.setInterval(() => {
      broadcastCurrentPlayback("playing");
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [activeItem, broadcastCurrentPlayback, canControlPlayback, isPlaying, roomSync.connectionState]);

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

    const drift = calculatePlaybackDrift({
      snapshot: event.snapshot,
      roomTimeMs: roomSync.getRoomTimeMs(),
      localMediaTimeMs: video.currentTime * 1000
    });
    const correction = classifyDrift(drift);
    setDriftMs(Math.round(drift));
    setDriftCorrection(correction.correction);

    if (correction.correction === "seek") {
      const targetTime = Math.max(0, (video.currentTime * 1000 + drift) / 1000);
      video.currentTime = video.duration ? Math.min(video.duration, targetTime) : targetTime;
    } else if (correction.correction === "none") {
      video.playbackRate = event.snapshot.playbackRate;
    } else {
      video.playbackRate = correction.temporaryRate * event.snapshot.playbackRate;
    }

    if (event.snapshot.state === "playing" && video.paused) {
      void video.play();
    }

    if (event.snapshot.state === "paused" && !video.paused) {
      video.pause();
    }
  }, [activeItem?.id, roomSync.getRoomTimeMs, roomSync.lastRemotePlayback]);

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

      if (event.key.toLowerCase() === "f") {
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, jumpBy, togglePlayback]);

  useEffect(() => {
    return () => playlist.forEach((item) => URL.revokeObjectURL(item.url));
  }, [playlist]);

  useEffect(() => {
    return () => {
      if (subtitleTrack) {
        URL.revokeObjectURL(subtitleTrack.url);
      }
    };
  }, [subtitleTrack]);

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

        <div className="video-stage" ref={stageRef}>
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
            >
              {subtitleTrack && (
                <track
                  key={subtitleTrack.url}
                  kind="subtitles"
                  src={subtitleTrack.url}
                  label={subtitleTrack.name}
                  default
                />
              )}
            </video>
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
            <button title="倍速" onClick={cyclePlaybackRate} disabled={!activeItem}>
              <Gauge size={18} />
              <span className="rate-label">{playbackRate}x</span>
            </button>
            <button title="全屏" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
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
              <dd>{driftCorrection}</dd>
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
              <small>
                {formatFingerprintLabel(activeItem)} · {activeItem.id}
              </small>
              <em className={peerNeedsCurrentMedia ? "match-warning" : "match-ok"}>
                {roomSync.connectionState !== "connected"
                  ? "本地匹配就绪"
                  : peerMatchCount > 0
                    ? `${peerMatchCount} 个对方设备已匹配`
                    : roomSync.peerCount > 1
                      ? "对方缺少当前文件"
                      : "等待对方加入"}
              </em>
              <button
                className="secondary-action compact-action"
                onClick={() => void verifyActiveFile()}
                disabled={isStrictHashing}
              >
                <ShieldCheck size={16} />
                {isStrictHashing ? "校验中" : "严格校验"}
              </button>
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
          <input
            ref={subtitleInputRef}
            className="hidden-input"
            type="file"
            accept=".srt,.vtt,text/vtt"
            onChange={handleSubtitle}
          />
          <button className="secondary-action" onClick={() => subtitleInputRef.current?.click()}>
            <Captions size={17} />
            {subtitleTrack ? subtitleTrack.name : "加载字幕"}
          </button>
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
          {roomPlaylist.length > 0 && (
            <div className="room-playlist">
              <strong>房间队列</strong>
              {roomPlaylist.slice(0, 4).map((item) => (
                <span key={item.mediaId}>
                  {item.episodeKey ? `E${item.episodeKey.episode} · ` : ""}
                  {item.name}
                </span>
              ))}
            </div>
          )}
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

function formatFingerprintLabel(item: PlaylistItem): string {
  if (item.fingerprintStatus === "hashing") {
    return "strict hashing";
  }

  if (item.fingerprintStatus === "pending") {
    return "segmenting";
  }

  if (item.fingerprintStatus === "error") {
    return `${item.fingerprintConfidence} fingerprint failed`;
  }

  return `${item.fingerprintConfidence} fingerprint`;
}
