export interface RoomMember {
  memberId: string;
  displayName: string;
}

export interface RoomSnapshot {
  roomId: string;
  members: RoomMember[];
}

export class RoomStore {
  private readonly rooms = new Map<string, Map<string, RoomMember>>();

  join(roomId: string, member: RoomMember): RoomSnapshot {
    const normalizedRoomId = normalizeRoomId(roomId);
    const members = this.rooms.get(normalizedRoomId) ?? new Map<string, RoomMember>();
    members.set(member.memberId, member);
    this.rooms.set(normalizedRoomId, members);
    return this.snapshot(normalizedRoomId);
  }

  leave(roomId: string, memberId: string): RoomSnapshot | null {
    const normalizedRoomId = normalizeRoomId(roomId);
    const members = this.rooms.get(normalizedRoomId);

    if (!members) {
      return null;
    }

    members.delete(memberId);

    if (members.size === 0) {
      this.rooms.delete(normalizedRoomId);
      return { roomId: normalizedRoomId, members: [] };
    }

    return this.snapshot(normalizedRoomId);
  }

  snapshot(roomId: string): RoomSnapshot {
    const normalizedRoomId = normalizeRoomId(roomId);
    const members = this.rooms.get(normalizedRoomId);
    return {
      roomId: normalizedRoomId,
      members: members ? Array.from(members.values()) : []
    };
  }
}

export function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

