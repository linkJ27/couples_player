import { quickMediaFingerprint } from "@couples-player/protocol";
import type { MediaPresenceItem, MemberMediaPresence } from "@couples-player/protocol";

export interface PlaylistItem {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  url: string;
  durationMs?: number;
}

export function createPlaylistItems(files: File[]): PlaylistItem[] {
  return files.map((file) => {
    const fingerprint = quickMediaFingerprint({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    });

    return {
      id: fingerprint.mediaId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      url: URL.createObjectURL(file)
    };
  });
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00";
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function inferNextEpisodeIndex(items: PlaylistItem[], currentIndex: number): number {
  if (items.length === 0) {
    return -1;
  }

  return currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
}

export function toMediaPresence(items: PlaylistItem[]): MediaPresenceItem[] {
  return items.map((item) => ({
    mediaId: item.id,
    name: item.name,
    size: item.size,
    durationMs: item.durationMs
  }));
}

export function countPeersWithMedia(
  mediaId: string | null,
  mediaPresence: MemberMediaPresence[],
  localMemberId: string
): number {
  if (!mediaId) {
    return 0;
  }

  return mediaPresence.filter(
    (member) => member.memberId !== localMemberId && member.media.some((item) => item.mediaId === mediaId)
  ).length;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
