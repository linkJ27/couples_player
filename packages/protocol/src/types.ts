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

export interface FileMatchInput {
  name: string;
  size: number;
  lastModified: number;
  durationMs?: number;
}

export interface FileMatchResult {
  mediaId: string;
  label: string;
  confidence: "quick" | "strict";
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
