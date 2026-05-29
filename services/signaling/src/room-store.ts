import type { PlaybackSnapshot, RoomMode, RoomSnapshotMessage } from "@couples-player/protocol";

export interface RoomMember {
  memberId: string;
  sessionId: string;
  displayName: string;
}

export interface RoomSnapshot {
  roomId: string;
  members: RoomMember[];
  mode: RoomMode;
  leaderId: string | null;
  playbackSnapshot: PlaybackSnapshot | null;
}

export class RoomStore {
  private readonly rooms = new Map<
    string,
    {
      members: Map<string, RoomMember>;
      mode: RoomMode;
      leaderId: string | null;
      playbackSnapshot: PlaybackSnapshot | null;
    }
  >();

  join(roomId: string, member: RoomMember): RoomSnapshot {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room =
      this.rooms.get(normalizedRoomId) ??
      {
        members: new Map<string, RoomMember>(),
        mode: "leader" as RoomMode,
        leaderId: null,
        playbackSnapshot: null
      };
    room.members.set(member.memberId, member);
    room.leaderId ??= member.memberId;
    this.rooms.set(normalizedRoomId, room);
    return this.snapshot(normalizedRoomId);
  }

  leave(roomId: string, memberId: string): RoomSnapshot | null {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      return null;
    }

    room.members.delete(memberId);

    if (room.members.size === 0) {
      this.rooms.delete(normalizedRoomId);
      return {
        roomId: normalizedRoomId,
        members: [],
        mode: room.mode,
        leaderId: null,
        playbackSnapshot: room.playbackSnapshot
      };
    }

    if (room.leaderId === memberId) {
      room.leaderId = room.members.keys().next().value ?? null;
    }

    return this.snapshot(normalizedRoomId);
  }

  setMode(roomId: string, mode: RoomMode): RoomSnapshot {
    const room = this.ensureRoom(roomId);
    room.mode = mode;
    return this.snapshot(roomId);
  }

  claimLeader(roomId: string, memberId: string): RoomSnapshot {
    const room = this.ensureRoom(roomId);
    if (room.members.has(memberId)) {
      room.leaderId = memberId;
    }
    return this.snapshot(roomId);
  }

  canBroadcastPlayback(roomId: string, memberId: string): boolean {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (!room) {
      return false;
    }

    return room.mode === "free" || room.leaderId === memberId;
  }

  updatePlayback(roomId: string, snapshot: PlaybackSnapshot): RoomSnapshot {
    const room = this.ensureRoom(roomId);
    room.playbackSnapshot = snapshot;
    return this.snapshot(roomId);
  }

  snapshot(roomId: string): RoomSnapshot {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);
    return {
      roomId: normalizedRoomId,
      members: room ? Array.from(room.members.values()) : [],
      mode: room?.mode ?? "leader",
      leaderId: room?.leaderId ?? null,
      playbackSnapshot: room?.playbackSnapshot ?? null
    };
  }

  toMessage(roomId: string): RoomSnapshotMessage {
    const snapshot = this.snapshot(roomId);
    return {
      roomId: snapshot.roomId,
      peerCount: snapshot.members.length,
      mode: snapshot.mode,
      leaderId: snapshot.leaderId,
      playbackSnapshot: snapshot.playbackSnapshot
    };
  }

  private ensureRoom(roomId: string) {
    const normalizedRoomId = normalizeRoomId(roomId);
    const existing = this.rooms.get(normalizedRoomId);
    if (existing) {
      return existing;
    }

    const room = {
      members: new Map<string, RoomMember>(),
      mode: "leader" as RoomMode,
      leaderId: null,
      playbackSnapshot: null
    };
    this.rooms.set(normalizedRoomId, room);
    return room;
  }
}

export function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}
