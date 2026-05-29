export type PlaybackState = "idle" | "playing" | "paused" | "ended";

export type RoomMode = "leader" | "free";

export type DriftCorrection = "none" | "speed-up" | "slow-down" | "seek";

export interface PlaybackSnapshot {
  version: number;
  epoch: number;
  state: PlaybackState;
  mediaId: string | null;
  anchorMediaTimeMs: number;
  anchorRoomTimeMs: number;
  playbackRate: number;
  leaderId: string;
}

export interface PlaybackSyncCommand {
  commandId: string;
  senderId: string;
  epoch: number;
  logicalClock: number;
  issuedRoomTimeMs: number;
  action: "play" | "pause" | "seek" | "set_rate" | "load_media" | "next_item";
}

export type PlaybackControlAction = PlaybackSyncCommand["action"];

export interface ControlRequestMessage {
  requestId: string;
  senderId: string;
  requestedAction: PlaybackControlAction;
  payload?: {
    targetMediaTimeMs?: number;
    playbackRate?: number;
  };
  issuedRoomTimeMs: number;
}

export interface FileMatchInput {
  name: string;
  size: number;
  lastModified: number;
  durationMs?: number;
}

export interface FileMatchResult {
  mediaId: string;
  label: string;
  confidence: "quick" | "segmented" | "strict";
}

export interface MediaPresenceItem {
  mediaId: string;
  name: string;
  size: number;
  durationMs?: number;
  fingerprintConfidence?: FileMatchResult["confidence"];
}

export interface EpisodeKey {
  season: number | null;
  episode: number;
}

export interface PlaylistEntry {
  mediaId: string;
  name: string;
  size: number;
  durationMs?: number;
  episodeKey: EpisodeKey | null;
  fingerprintConfidence?: FileMatchResult["confidence"];
}

export interface MemberMediaPresence {
  memberId: string;
  displayName: string;
  media: MediaPresenceItem[];
}

export interface ReactionMessage {
  reactionId: string;
  senderId: string;
  emoji: string;
  mediaTimeMs: number;
  createdRoomTimeMs: number;
}

export interface RoomSnapshotMessage {
  roomId: string;
  peerCount: number;
  mode: RoomMode;
  leaderId: string | null;
  playbackSnapshot: PlaybackSnapshot | null;
  mediaPresence: MemberMediaPresence[];
  playlist: PlaylistEntry[];
  playlistVersion: number;
}

export type RealtimeClientMessage =
  | {
      type: "room.join";
      roomId: string;
      memberId: string;
      sessionId: string;
      displayName: string;
    }
  | {
      type: "room.set_mode";
      roomId: string;
      memberId: string;
      mode: RoomMode;
    }
  | {
      type: "room.claim_leader";
      roomId: string;
      memberId: string;
    }
  | {
      type: "clock.ping";
      pingId: string;
      clientSentAt: number;
    }
  | {
      type: "media.presence";
      roomId: string;
      memberId: string;
      media: MediaPresenceItem[];
    }
  | {
      type: "playlist.update";
      roomId: string;
      memberId: string;
      playlist: PlaylistEntry[];
    }
  | {
      type: "control.request";
      roomId: string;
      memberId: string;
      request: ControlRequestMessage;
    }
  | {
      type: "playback.broadcast";
      roomId: string;
      memberId: string;
      snapshot: PlaybackSnapshot;
    }
  | {
      type: "reaction.broadcast";
      roomId: string;
      memberId: string;
      reaction: ReactionMessage;
    };

export type RealtimeServerMessage =
  | {
      type: "room.joined";
      roomId: string;
      memberId: string;
      peerCount: number;
      mode: RoomMode;
      leaderId: string | null;
      playbackSnapshot: PlaybackSnapshot | null;
      mediaPresence: MemberMediaPresence[];
      playlist: PlaylistEntry[];
      playlistVersion: number;
    }
  | {
      type: "peer.count";
      roomId: string;
      peerCount: number;
    }
  | {
      type: "room.snapshot";
      snapshot: RoomSnapshotMessage;
    }
  | {
      type: "clock.pong";
      pingId: string;
      clientSentAt: number;
      serverTimeMs: number;
    }
  | {
      type: "media.presence";
      roomId: string;
      mediaPresence: MemberMediaPresence[];
    }
  | {
      type: "playlist.update";
      roomId: string;
      playlist: PlaylistEntry[];
      playlistVersion: number;
    }
  | {
      type: "control.requested";
      roomId: string;
      memberId: string;
      request: ControlRequestMessage;
    }
  | {
      type: "playback.remote";
      roomId: string;
      memberId: string;
      snapshot: PlaybackSnapshot;
    }
  | {
      type: "reaction.remote";
      roomId: string;
      memberId: string;
      reaction: ReactionMessage;
    }
  | {
      type: "room.error";
      message: string;
    };
