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

export type RealtimeClientMessage =
  | {
      type: "room.join";
      roomId: string;
      memberId: string;
      displayName: string;
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
    }
  | {
      type: "peer.count";
      roomId: string;
      peerCount: number;
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
