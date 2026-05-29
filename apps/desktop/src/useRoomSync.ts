import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PlaybackSnapshot,
  RealtimeClientMessage,
  RealtimeServerMessage,
  ReactionMessage
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

export function useRoomSync(roomCode: string) {
  const memberId = useMemo(() => crypto.randomUUID(), []);
  const socketRef = useRef<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [peerCount, setPeerCount] = useState(1);
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

    setConnectionState("connecting");
    const socket = new WebSocket(signalingUrl);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("connected");
      send({
        type: "room.join",
        roomId: roomCode,
        memberId,
        displayName: "Local viewer"
      });
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (!message) {
        return;
      }

      if (message.type === "room.joined" || message.type === "peer.count") {
        setPeerCount(message.peerCount);
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
      setConnectionState("disconnected");
      setPeerCount(1);
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
    });
  }, [memberId, roomCode, send]);

  const disconnect = useCallback(() => {
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

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  return {
    broadcastPlayback,
    broadcastReaction,
    connect,
    connectionState,
    disconnect,
    lastRemotePlayback,
    lastRemoteReaction,
    memberId,
    peerCount
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

