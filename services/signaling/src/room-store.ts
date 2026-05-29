import type {
  MediaPresenceItem,
  MemberMediaPresence,
  PlaybackSnapshot,
  PlaylistEntry,
  RoomMode,
  RoomSnapshotMessage
} from "@couples-player/protocol";

export interface RoomMember {
  memberId: string;
  sessionId: string;
  displayName: string;
  media: MediaPresenceItem[];
}

export interface RoomSnapshot {
  roomId: string;
  members: RoomMember[];
  mode: RoomMode;
  leaderId: string | null;
  playbackSnapshot: PlaybackSnapshot | null;
  mediaPresence: MemberMediaPresence[];
  playlist: PlaylistEntry[];
  playlistVersion: number;
}

export class RoomStore {
  private readonly rooms = new Map<
    string,
    {
      members: Map<string, RoomMember>;
      mode: RoomMode;
      leaderId: string | null;
      playbackSnapshot: PlaybackSnapshot | null;
      playlist: PlaylistEntry[];
      playlistVersion: number;
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
        playbackSnapshot: null,
        playlist: [],
        playlistVersion: 0
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
        playbackSnapshot: room.playbackSnapshot,
        mediaPresence: [],
        playlist: room.playlist,
        playlistVersion: room.playlistVersion
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

  updateMediaPresence(roomId: string, memberId: string, media: MediaPresenceItem[]): RoomSnapshot {
    const room = this.ensureRoom(roomId);
    const member = room.members.get(memberId);
    if (member) {
      member.media = dedupeMedia(media);
    }
    return this.snapshot(roomId);
  }

  updatePlaylist(roomId: string, playlist: PlaylistEntry[]): RoomSnapshot {
    const room = this.ensureRoom(roomId);
    room.playlist = dedupePlaylist(playlist);
    room.playlistVersion += 1;
    return this.snapshot(roomId);
  }

  hasPeerMedia(roomId: string, memberId: string, mediaId: string): boolean {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (!room) {
      return false;
    }

    for (const member of room.members.values()) {
      if (member.memberId !== memberId && member.media.some((item) => item.mediaId === mediaId)) {
        return true;
      }
    }

    return false;
  }

  snapshot(roomId: string): RoomSnapshot {
    const normalizedRoomId = normalizeRoomId(roomId);
    const room = this.rooms.get(normalizedRoomId);
    return {
      roomId: normalizedRoomId,
      members: room ? Array.from(room.members.values()) : [],
      mode: room?.mode ?? "leader",
      leaderId: room?.leaderId ?? null,
      playbackSnapshot: room?.playbackSnapshot ?? null,
      mediaPresence: room ? toMediaPresence(Array.from(room.members.values())) : [],
      playlist: room?.playlist ?? [],
      playlistVersion: room?.playlistVersion ?? 0
    };
  }

  toMessage(roomId: string): RoomSnapshotMessage {
    const snapshot = this.snapshot(roomId);
    return {
      roomId: snapshot.roomId,
      peerCount: snapshot.members.length,
      mode: snapshot.mode,
      leaderId: snapshot.leaderId,
      playbackSnapshot: snapshot.playbackSnapshot,
      mediaPresence: snapshot.mediaPresence,
      playlist: snapshot.playlist,
      playlistVersion: snapshot.playlistVersion
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
      playbackSnapshot: null,
      playlist: [],
      playlistVersion: 0
    };
    this.rooms.set(normalizedRoomId, room);
    return room;
  }
}

export function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function dedupeMedia(media: MediaPresenceItem[]): MediaPresenceItem[] {
  const byId = new Map<string, MediaPresenceItem>();
  for (const item of media) {
    byId.set(item.mediaId, item);
  }
  return Array.from(byId.values()).slice(0, 200);
}

function toMediaPresence(members: RoomMember[]): MemberMediaPresence[] {
  return members.map((member) => ({
    memberId: member.memberId,
    displayName: member.displayName,
    media: member.media
  }));
}

function dedupePlaylist(playlist: PlaylistEntry[]): PlaylistEntry[] {
  const seen = new Set<string>();
  const result: PlaylistEntry[] = [];
  for (const item of playlist) {
    if (!seen.has(item.mediaId)) {
      seen.add(item.mediaId);
      result.push(item);
    }
  }
  return result.slice(0, 500);
}
