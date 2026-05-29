import { createServer } from "node:http";
import type { RealtimeClientMessage, RealtimeServerMessage } from "@couples-player/protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomStore, normalizeRoomId } from "./room-store";

interface ClientSession {
  socket: WebSocket;
  roomId: string | null;
  memberId: string | null;
  sessionId: string | null;
}

const port = Number(process.env.PORT ?? 8787);
const reconnectWindowMs = Number(process.env.RECONNECT_WINDOW_MS ?? 30_000);
const store = new RoomStore();
const sessions = new Set<ClientSession>();
const pendingLeaves = new Map<string, NodeJS.Timeout>();
const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  const session: ClientSession = {
    socket,
    roomId: null,
    memberId: null,
    sessionId: null
  };
  sessions.add(session);

  socket.on("message", (raw) => {
    const message = parseMessage(raw.toString());
    if (!message) {
      send(session, { type: "room.error", message: "Invalid message" });
      return;
    }

    handleMessage(session, message);
  });

  socket.on("close", () => {
    leaveSession(session);
    sessions.delete(session);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`signaling service listening on ws://127.0.0.1:${port}`);
});

function handleMessage(session: ClientSession, message: RealtimeClientMessage) {
  if (message.type === "room.join") {
    const roomId = normalizeRoomId(message.roomId);
    if (!roomId) {
      send(session, { type: "room.error", message: "Room id is required" });
      return;
    }

    leaveSession(session);
    session.roomId = roomId;
    session.memberId = message.memberId;
    session.sessionId = message.sessionId;
    clearPendingLeave(roomId, message.memberId);
    const snapshot = store.join(roomId, {
      memberId: message.memberId,
      sessionId: message.sessionId,
      displayName: message.displayName,
      media: []
    });
    send(session, {
      type: "room.joined",
      roomId,
      memberId: message.memberId,
      peerCount: snapshot.members.length,
      mode: snapshot.mode,
      leaderId: snapshot.leaderId,
      playbackSnapshot: snapshot.playbackSnapshot,
      mediaPresence: snapshot.mediaPresence
    });
    broadcastRoomSnapshot(roomId);
    return;
  }

  if (message.type === "clock.ping") {
    send(session, {
      type: "clock.pong",
      pingId: message.pingId,
      clientSentAt: message.clientSentAt,
      serverTimeMs: Date.now()
    });
    return;
  }

  if (!session.roomId || !session.memberId || session.roomId !== normalizeRoomId(message.roomId)) {
    send(session, { type: "room.error", message: "Join a room before broadcasting" });
    return;
  }

  if (message.type === "room.set_mode") {
    if (store.snapshot(session.roomId).leaderId !== session.memberId) {
      send(session, { type: "room.error", message: "Only the leader can change mode" });
      return;
    }

    store.setMode(session.roomId, message.mode);
    broadcastRoomSnapshot(session.roomId);
    return;
  }

  if (message.type === "room.claim_leader") {
    store.claimLeader(session.roomId, session.memberId);
    broadcastRoomSnapshot(session.roomId);
    return;
  }

  if (message.type === "media.presence") {
    store.updateMediaPresence(session.roomId, session.memberId, message.media);
    broadcastMediaPresence(session.roomId);
    broadcastRoomSnapshot(session.roomId);
    return;
  }

  if (message.type === "playback.broadcast") {
    if (!store.canBroadcastPlayback(session.roomId, session.memberId)) {
      send(session, { type: "room.error", message: "Only the leader can control playback in leader mode" });
      return;
    }

    store.updatePlayback(session.roomId, message.snapshot);
    broadcast(session, {
      type: "playback.remote",
      roomId: session.roomId,
      memberId: session.memberId,
      snapshot: message.snapshot
    });
  }

  if (message.type === "reaction.broadcast") {
    broadcast(session, {
      type: "reaction.remote",
      roomId: session.roomId,
      memberId: session.memberId,
      reaction: message.reaction
    });
  }
}

function broadcastMediaPresence(roomId: string) {
  const snapshot = store.toMessage(roomId);
  for (const session of sessions) {
    if (session.roomId === roomId) {
      send(session, {
        type: "media.presence",
        roomId,
        mediaPresence: snapshot.mediaPresence
      });
    }
  }
}

function leaveSession(session: ClientSession) {
  if (!session.roomId || !session.memberId) {
    return;
  }

  const roomId = session.roomId;
  const memberId = session.memberId;
  session.roomId = null;
  session.memberId = null;
  session.sessionId = null;

  const leaveKey = createLeaveKey(roomId, memberId);
  clearPendingLeave(roomId, memberId);
  pendingLeaves.set(
    leaveKey,
    setTimeout(() => {
      store.leave(roomId, memberId);
      pendingLeaves.delete(leaveKey);
      broadcastRoomSnapshot(roomId);
    }, reconnectWindowMs)
  );
}

function broadcastRoomSnapshot(roomId: string) {
  const snapshot = store.toMessage(roomId);
  for (const session of sessions) {
    if (session.roomId === roomId) {
      send(session, { type: "peer.count", roomId, peerCount: snapshot.peerCount });
      send(session, { type: "room.snapshot", snapshot });
    }
  }
}

function broadcast(sender: ClientSession, message: RealtimeServerMessage) {
  for (const session of sessions) {
    if (session !== sender && session.roomId === sender.roomId) {
      send(session, message);
    }
  }
}

function send(session: ClientSession, message: RealtimeServerMessage) {
  if (session.socket.readyState === session.socket.OPEN) {
    session.socket.send(JSON.stringify(message));
  }
}

function parseMessage(raw: string): RealtimeClientMessage | null {
  try {
    return JSON.parse(raw) as RealtimeClientMessage;
  } catch {
    return null;
  }
}

function clearPendingLeave(roomId: string, memberId: string) {
  const leaveKey = createLeaveKey(roomId, memberId);
  const timeout = pendingLeaves.get(leaveKey);
  if (timeout) {
    clearTimeout(timeout);
    pendingLeaves.delete(leaveKey);
  }
}

function createLeaveKey(roomId: string, memberId: string): string {
  return `${roomId}:${memberId}`;
}
