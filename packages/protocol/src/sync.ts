import type {
  ControlRequestMessage,
  DataChannelSyncMessage,
  DriftCorrection,
  FileMatchInput,
  FileMatchResult,
  PlaybackControlAction,
  PlaybackSnapshot,
  PlaybackState,
  PlaybackSyncCommand
} from "./types";

export function createPlaybackSnapshot(input: {
  version?: number;
  epoch?: number;
  state: PlaybackState;
  mediaId: string | null;
  mediaTimeMs: number;
  roomTimeMs: number;
  playbackRate?: number;
  leaderId: string;
}): PlaybackSnapshot {
  return {
    version: input.version ?? 1,
    epoch: input.epoch ?? 1,
    state: input.state,
    mediaId: input.mediaId,
    anchorMediaTimeMs: clampNonNegative(input.mediaTimeMs),
    anchorRoomTimeMs: clampNonNegative(input.roomTimeMs),
    playbackRate: input.playbackRate ?? 1,
    leaderId: input.leaderId
  };
}

export function projectMediaTime(snapshot: PlaybackSnapshot, roomTimeMs: number): number {
  if (snapshot.state !== "playing") {
    return snapshot.anchorMediaTimeMs;
  }

  const elapsedMs = Math.max(0, roomTimeMs - snapshot.anchorRoomTimeMs);
  return snapshot.anchorMediaTimeMs + elapsedMs * snapshot.playbackRate;
}

export function calculatePlaybackDrift(input: {
  snapshot: PlaybackSnapshot;
  roomTimeMs: number;
  localMediaTimeMs: number;
}): number {
  return projectMediaTime(input.snapshot, input.roomTimeMs) - input.localMediaTimeMs;
}

export function createControlRequest(input: {
  requestId: string;
  senderId: string;
  requestedAction: PlaybackControlAction;
  payload?: ControlRequestMessage["payload"];
  issuedRoomTimeMs: number;
}): ControlRequestMessage {
  return {
    requestId: input.requestId,
    senderId: input.senderId,
    requestedAction: input.requestedAction,
    payload: sanitizeControlPayload(input.payload),
    issuedRoomTimeMs: clampNonNegative(input.issuedRoomTimeMs)
  };
}

export function parseDataChannelSyncMessage(raw: string): DataChannelSyncMessage | null {
  try {
    const message = JSON.parse(raw) as Partial<DataChannelSyncMessage>;
    if (!message || typeof message !== "object" || typeof message.memberId !== "string") {
      return null;
    }

    if (message.type === "p2p.playback" && "snapshot" in message) {
      return message as DataChannelSyncMessage;
    }

    if (message.type === "p2p.reaction" && "reaction" in message) {
      return message as DataChannelSyncMessage;
    }

    if (message.type === "p2p.control_request" && "request" in message) {
      return message as DataChannelSyncMessage;
    }

    return null;
  } catch {
    return null;
  }
}

export function classifyDrift(driftMs: number): {
  correction: DriftCorrection;
  temporaryRate: number;
} {
  const absDrift = Math.abs(driftMs);

  if (absDrift <= 80) {
    return { correction: "none", temporaryRate: 1 };
  }

  if (absDrift > 250) {
    return { correction: "seek", temporaryRate: 1 };
  }

  return driftMs > 0
    ? { correction: "speed-up", temporaryRate: 1.03 }
    : { correction: "slow-down", temporaryRate: 0.97 };
}

export function estimateClockOffset(input: {
  localSentMs: number;
  remoteReceivedMs: number;
  localReceivedMs: number;
}): number {
  const roundTripMs = Math.max(0, input.localReceivedMs - input.localSentMs);
  return input.remoteReceivedMs - (input.localSentMs + roundTripMs / 2);
}

export function resolveCommandOrder(
  left: PlaybackSyncCommand,
  right: PlaybackSyncCommand
): PlaybackSyncCommand {
  if (left.epoch !== right.epoch) {
    return left.epoch > right.epoch ? left : right;
  }

  if (left.logicalClock !== right.logicalClock) {
    return left.logicalClock > right.logicalClock ? left : right;
  }

  return left.senderId.localeCompare(right.senderId) >= 0 ? left : right;
}

export function quickMediaFingerprint(file: FileMatchInput): FileMatchResult {
  const duration = Math.round(file.durationMs ?? 0);
  const normalizedName = file.name.trim().toLowerCase();
  const raw = `${normalizedName}:${file.size}:${file.lastModified}:${duration}`;

  return {
    mediaId: `quick:${hashString(raw)}`,
    label: file.name,
    confidence: "quick"
  };
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sanitizeControlPayload(payload: ControlRequestMessage["payload"]): ControlRequestMessage["payload"] {
  if (!payload) {
    return undefined;
  }

  return {
    targetMediaTimeMs:
      payload.targetMediaTimeMs === undefined ? undefined : clampNonNegative(payload.targetMediaTimeMs),
    playbackRate:
      payload.playbackRate === undefined || !Number.isFinite(payload.playbackRate)
        ? undefined
        : Math.min(4, Math.max(0.1, payload.playbackRate))
  };
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
