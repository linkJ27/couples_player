import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MediaPresenceItem,
  PlaybackSnapshot,
  RealtimeClientMessage,
  RealtimeServerMessage,
  ReactionMessage,
  RoomMode,
  RoomSnapshotMessage
} from "@couples-player/protocol";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface RemotePlaybackEvent {
  memberId: string;
  snapshot: PlaybackSnapshot;
  receivedAt: number;
}

export interface RemoteReactionEvent {
  memberId: string;
  reaction: ReactionMessage;
  receivedAt: number;
}

const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? "ws://127.0.0.1:8787";
const reconnectDelayMs = 1_500;
const clockPingIntervalMs = 2_500;

export function useRoomSync(roomCode: string) {
  const memberId = useMemo(() => getStableId("couples-player:member-id"), []);
  const sessionId = useMemo(() => getStableId("couples-player:session-id"), []);
  const socketRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [peerCount, setPeerCount] = useState(1);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null);
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshotMessage | null>(null);
  const [lastRemotePlayback, setLastRemotePlayback] = useState<RemotePlaybackEvent | null>(null);
  const [lastRemoteReaction, setLastRemoteReaction] = useState<RemoteReactionEvent | null>(null);

  const send = useCallback((message: RealtimeClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    shouldReconnectRef.current = true;
    setConnectionState("connecting");
    const socket = new WebSocket(signalingUrl);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("connected");
      send({
        type: "room.join",
        roomId: roomCode,
        memberId,
        sessionId,
        displayName: "Local viewer"
      });
      sendClockPing(socket);
      pingTimerRef.current = window.setInterval(() => sendClockPing(socket), clockPingIntervalMs);
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "room.joined" || message.type === "peer.count") {
        setPeerCount(message.peerCount);
      }

      if (message.type === "room.joined") {
        setRoomSnapshot({
          roomId: message.roomId,
          peerCount: message.peerCount,
          mode: message.mode,
          leaderId: message.leaderId,
          playbackSnapshot: message.playbackSnapshot,
          mediaPresence: message.mediaPresence
        });
      }

      if (message.type === "room.snapshot") {
        setRoomSnapshot(message.snapshot);
        setPeerCount(message.snapshot.peerCount);
      }

      if (message.type === "clock.pong") {
        const receivedAt = performance.now();
        const roundTripMs = Math.max(0, receivedAt - message.clientSentAt);
        setLatencyMs(Math.round(roundTripMs));
        setClockOffsetMs(Math.round(message.serverTimeMs - (message.clientSentAt + roundTripMs / 2)));
      }

      if (message.type === "playback.remote") {
        setLastRemotePlayback({
          memberId: message.memberId,
          snapshot: message.snapshot,
          receivedAt: Date.now()
        });
      }

      if (message.type === "reaction.remote") {
        setLastRemoteReaction({
          memberId: message.memberId,
          reaction: message.reaction,
          receivedAt: Date.now()
        });
      }

      if (message.type === "room.error") {
        setConnectionState("error");
      }
    });

    socket.addEventListener("close", () => {
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      setConnectionState("disconnected");
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = window.setTimeout(connect, reconnectDelayMs);
      } else {
        setPeerCount(1);
      }
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
    });
  }, [memberId, roomCode, send, sessionId]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setConnectionState("disconnected");
    setPeerCount(1);
  }, []);

  const broadcastPlayback = useCallback(
    (snapshot: PlaybackSnapshot) =>
      send({
        type: "playback.broadcast",
        roomId: roomCode,
        memberId,
        snapshot
      }),
    [memberId, roomCode, send]
  );

  const broadcastReaction = useCallback(
    (reaction: ReactionMessage) =>
      send({
        type: "reaction.broadcast",
        roomId: roomCode,
        memberId,
        reaction
      }),
    [memberId, roomCode, send]
  );

  const broadcastMediaPresence = useCallback(
    (media: MediaPresenceItem[]) =>
      send({
        type: "media.presence",
        roomId: roomCode,
        memberId,
        media
      }),
    [memberId, roomCode, send]
  );

  const setRoomMode = useCallback(
    (mode: RoomMode) =>
      send({
        type: "room.set_mode",
        roomId: roomCode,
        memberId,
        mode
      }),
    [memberId, roomCode, send]
  );

  const claimLeader = useCallback(
    () =>
      send({
        type: "room.claim_leader",
        roomId: roomCode,
        memberId
      }),
    [memberId, roomCode, send]
  );

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  return {
    broadcastPlayback,
    broadcastMediaPresence,
    broadcastReaction,
    claimLeader,
    clockOffsetMs,
    connect,
    connectionState,
    disconnect,
    lastRemotePlayback,
    lastRemoteReaction,
    latencyMs,
    leaderId: roomSnapshot?.leaderId ?? null,
    memberId,
    peerCount,
    roomMode: roomSnapshot?.mode ?? "leader",
    roomSnapshot,
    setRoomMode
  };
}

function parseServerMessage(raw: unknown): RealtimeServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    return JSON.parse(raw) as RealtimeServerMessage;
  } catch {
    return null;
  }
}

function getStableId(key: string): string {
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function sendClockPing(socket: WebSocket) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: "clock.ping",
      pingId: crypto.randomUUID(),
      clientSentAt: performance.now()
    } satisfies RealtimeClientMessage)
  );
}
