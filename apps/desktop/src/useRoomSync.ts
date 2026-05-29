import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createControlRequest, parseDataChannelSyncMessage } from "@couples-player/protocol";
import type {
  ControlRequestMessage,
  DataChannelSyncMessage,
  MediaPresenceItem,
  PlaybackSnapshot,
  PlaylistEntry,
  RealtimeClientMessage,
  RealtimeServerMessage,
  ReactionMessage,
  RoomMode,
  RoomSnapshotMessage,
  WebRtcSignalMessage
} from "@couples-player/protocol";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";
type DataChannelState = "idle" | "connecting" | "connected";

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

export interface RemoteControlRequestEvent {
  memberId: string;
  request: ControlRequestMessage;
  receivedAt: number;
}

const signalingUrl = import.meta.env.VITE_SIGNALING_URL ?? "ws://127.0.0.1:8787";
const reconnectDelayMs = 1_500;
const clockPingIntervalMs = 2_500;
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

export function useRoomSync(roomCode: string) {
  const memberId = useMemo(() => getStableId("couples-player:member-id"), []);
  const sessionId = useMemo(() => getStableId("couples-player:session-id"), []);
  const socketRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const dataChannelsRef = useRef(new Map<string, RTCDataChannel>());
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
  const [lastRemoteControlRequest, setLastRemoteControlRequest] = useState<RemoteControlRequestEvent | null>(null);
  const [dataChannelState, setDataChannelState] = useState<DataChannelState>("idle");

  const send = useCallback((message: RealtimeClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const sendPeerMessage = useCallback((message: DataChannelSyncMessage, targetMemberId?: string) => {
    let delivered = false;
    for (const [peerId, channel] of dataChannelsRef.current) {
      if (targetMemberId && peerId !== targetMemberId) {
        continue;
      }

      if (channel.readyState === "open") {
        channel.send(JSON.stringify(message));
        delivered = true;
      }
    }

    return delivered;
  }, []);

  const handlePeerMessage = useCallback((peerId: string, raw: string) => {
    const message = parseDataChannelMessage(raw);
    if (!message) {
      return;
    }

    if (message.memberId === memberId) {
      return;
    }

    if (message.type === "p2p.playback") {
      setLastRemotePlayback({
        memberId: message.memberId,
        snapshot: message.snapshot,
        receivedAt: Date.now()
      });
    }

    if (message.type === "p2p.reaction") {
      setLastRemoteReaction({
        memberId: message.memberId,
        reaction: message.reaction,
        receivedAt: Date.now()
      });
    }

    if (message.type === "p2p.control_request") {
      setLastRemoteControlRequest({
        memberId: peerId,
        request: message.request,
        receivedAt: Date.now()
      });
    }
  }, [memberId]);

  const refreshDataChannelState = useCallback(() => {
    const hasOpenChannel = Array.from(dataChannelsRef.current.values()).some((channel) => channel.readyState === "open");
    if (hasOpenChannel) {
      setDataChannelState("connected");
      return;
    }

    setDataChannelState(peerConnectionsRef.current.size > 0 ? "connecting" : "idle");
  }, []);

  const attachDataChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      dataChannelsRef.current.set(peerId, channel);
      channel.addEventListener("open", refreshDataChannelState);
      channel.addEventListener("close", () => {
        dataChannelsRef.current.delete(peerId);
        refreshDataChannelState();
      });
      channel.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          handlePeerMessage(peerId, event.data);
        }
      });
      refreshDataChannelState();
    },
    [handlePeerMessage, refreshDataChannelState]
  );

  const sendWebRtcSignal = useCallback(
    (targetMemberId: string, signal: WebRtcSignalMessage) =>
      send({
        type: "webrtc.signal",
        roomId: roomCode,
        memberId,
        targetMemberId,
        signal
      }),
    [memberId, roomCode, send]
  );

  const ensurePeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) {
        return existing;
      }

      const connection = new RTCPeerConnection(rtcConfig);
      peerConnectionsRef.current.set(peerId, connection);
      setDataChannelState("connecting");

      connection.addEventListener("icecandidate", (event) => {
        if (event.candidate) {
          sendWebRtcSignal(peerId, {
            signalId: crypto.randomUUID(),
            type: "ice",
            candidate: event.candidate.toJSON()
          });
        }
      });
      connection.addEventListener("connectionstatechange", () => {
        if (["closed", "failed", "disconnected"].includes(connection.connectionState)) {
          peerConnectionsRef.current.delete(peerId);
          dataChannelsRef.current.delete(peerId);
        }
        refreshDataChannelState();
      });
      connection.addEventListener("datachannel", (event) => {
        attachDataChannel(peerId, event.channel);
      });

      return connection;
    },
    [attachDataChannel, refreshDataChannelState, sendWebRtcSignal]
  );

  const startPeerConnection = useCallback(
    async (peerId: string) => {
      if (!("RTCPeerConnection" in window) || peerConnectionsRef.current.has(peerId)) {
        return;
      }

      const connection = ensurePeerConnection(peerId);
      const channel = connection.createDataChannel("couples-player-sync", { ordered: true });
      attachDataChannel(peerId, channel);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (connection.localDescription) {
        sendWebRtcSignal(peerId, {
          signalId: crypto.randomUUID(),
          type: "offer",
          description: connection.localDescription.toJSON()
        });
      }
    },
    [attachDataChannel, ensurePeerConnection, sendWebRtcSignal]
  );

  const handleWebRtcSignal = useCallback(
    async (peerId: string, signal: WebRtcSignalMessage) => {
      if (!("RTCPeerConnection" in window)) {
        return;
      }

      const connection = ensurePeerConnection(peerId);
      if (signal.type === "offer" && signal.description) {
        await connection.setRemoteDescription(signal.description);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        if (connection.localDescription) {
          sendWebRtcSignal(peerId, {
            signalId: crypto.randomUUID(),
            type: "answer",
            description: connection.localDescription.toJSON()
          });
        }
      }

      if (signal.type === "answer" && signal.description) {
        await connection.setRemoteDescription(signal.description);
      }

      if (signal.type === "ice" && signal.candidate) {
        await connection.addIceCandidate(signal.candidate);
      }
    },
    [ensurePeerConnection, sendWebRtcSignal]
  );

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
          mediaPresence: message.mediaPresence,
          playlist: message.playlist,
          playlistVersion: message.playlistVersion
        });
      }

      if (message.type === "room.snapshot") {
        setRoomSnapshot(message.snapshot);
        setPeerCount(message.snapshot.peerCount);
      }

      if (message.type === "playlist.update") {
        setRoomSnapshot((current) =>
          current
            ? {
                ...current,
                playlist: message.playlist,
                playlistVersion: message.playlistVersion
              }
            : current
        );
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

      if (message.type === "control.requested") {
        setLastRemoteControlRequest({
          memberId: message.memberId,
          request: message.request,
          receivedAt: Date.now()
        });
      }

      if (message.type === "webrtc.signal") {
        void handleWebRtcSignal(message.memberId, message.signal);
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
  }, [handleWebRtcSignal, memberId, roomCode, send, sessionId]);

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
    closePeerConnections(peerConnectionsRef.current, dataChannelsRef.current);
    setDataChannelState("idle");
    setConnectionState("disconnected");
    setPeerCount(1);
  }, []);

  const broadcastPlayback = useCallback(
    (snapshot: PlaybackSnapshot) => {
      sendPeerMessage({
        type: "p2p.playback",
        memberId,
        snapshot
      });
      return send({
        type: "playback.broadcast",
        roomId: roomCode,
        memberId,
        snapshot
      });
    },
    [memberId, roomCode, send, sendPeerMessage]
  );

  const broadcastReaction = useCallback(
    (reaction: ReactionMessage) => {
      const delivered = sendPeerMessage({
        type: "p2p.reaction",
        memberId,
        reaction
      });
      if (delivered) {
        return true;
      }

      return send({
        type: "reaction.broadcast",
        roomId: roomCode,
        memberId,
        reaction
      });
    },
    [memberId, roomCode, send, sendPeerMessage]
  );

  const requestControl = useCallback(
    (request: Omit<ControlRequestMessage, "requestId" | "senderId" | "issuedRoomTimeMs">) => {
      const controlRequest = createControlRequest({
        requestedAction: request.requestedAction,
        payload: request.payload,
        requestId: crypto.randomUUID(),
        senderId: memberId,
        issuedRoomTimeMs: Math.round(performance.now() + (clockOffsetMs ?? 0))
      });
      const leaderId = roomSnapshot?.leaderId ?? undefined;
      if (
        leaderId &&
        sendPeerMessage(
          {
            type: "p2p.control_request",
            memberId,
            request: controlRequest
          },
          leaderId
        )
      ) {
        return true;
      }

      return send({
        type: "control.request",
        roomId: roomCode,
        memberId,
        request: controlRequest
      });
    },
    [clockOffsetMs, memberId, roomCode, roomSnapshot?.leaderId, send, sendPeerMessage]
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

  const broadcastPlaylist = useCallback(
    (playlist: PlaylistEntry[]) =>
      send({
        type: "playlist.update",
        roomId: roomCode,
        memberId,
        playlist
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

  const getRoomTimeMs = useCallback(
    () => performance.now() + (clockOffsetMs ?? 0),
    [clockOffsetMs]
  );

  useEffect(() => {
    if (connectionState !== "connected" || !roomSnapshot) {
      return;
    }

    const peerIds = roomSnapshot.mediaPresence
      .map((presence) => presence.memberId)
      .filter((peerId) => peerId !== memberId);
    const activePeerIds = new Set(peerIds);
    for (const peerId of peerConnectionsRef.current.keys()) {
      if (!activePeerIds.has(peerId)) {
        closePeerConnection(peerId, peerConnectionsRef.current, dataChannelsRef.current);
      }
    }

    for (const peerId of peerIds) {
      if (memberId < peerId) {
        void startPeerConnection(peerId);
      }
    }
    refreshDataChannelState();
  }, [connectionState, memberId, refreshDataChannelState, roomSnapshot, startPeerConnection]);

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
      closePeerConnections(peerConnectionsRef.current, dataChannelsRef.current);
    };
  }, []);

  return {
    broadcastPlayback,
    broadcastPlaylist,
    broadcastMediaPresence,
    broadcastReaction,
    claimLeader,
    clockOffsetMs,
    connect,
    connectionState,
    dataChannelState,
    disconnect,
    lastRemotePlayback,
    lastRemoteControlRequest,
    lastRemoteReaction,
    latencyMs,
    leaderId: roomSnapshot?.leaderId ?? null,
    memberId,
    peerCount,
    roomMode: roomSnapshot?.mode ?? "leader",
    roomSnapshot,
    getRoomTimeMs,
    requestControl,
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

function parseDataChannelMessage(raw: unknown): DataChannelSyncMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  return parseDataChannelSyncMessage(raw);
}

function closePeerConnections(
  connections: Map<string, RTCPeerConnection>,
  channels: Map<string, RTCDataChannel>
) {
  for (const channel of channels.values()) {
    channel.close();
  }
  channels.clear();

  for (const connection of connections.values()) {
    connection.close();
  }
  connections.clear();
}

function closePeerConnection(
  peerId: string,
  connections: Map<string, RTCPeerConnection>,
  channels: Map<string, RTCDataChannel>
) {
  channels.get(peerId)?.close();
  channels.delete(peerId);
  connections.get(peerId)?.close();
  connections.delete(peerId);
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
