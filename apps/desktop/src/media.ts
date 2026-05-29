import { quickMediaFingerprint } from "@couples-player/protocol";
import type { EpisodeKey, MediaPresenceItem, MemberMediaPresence, PlaylistEntry } from "@couples-player/protocol";

export interface PlaylistItem {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  url: string;
  durationMs?: number;
  episodeKey: EpisodeKey | null;
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
      url: URL.createObjectURL(file),
      episodeKey: inferEpisodeKey(file.name)
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

export function inferEpisodeKey(name: string): EpisodeKey | null {
  const sxxexx = /s(\d{1,2})e(\d{1,4})/i.exec(name);
  if (sxxexx) {
    return {
      season: Number(sxxexx[1]),
      episode: Number(sxxexx[2])
    };
  }

  const chineseEpisode = /第\s*(\d{1,4})\s*[集话話]/u.exec(name);
  if (chineseEpisode) {
    return {
      season: null,
      episode: Number(chineseEpisode[1])
    };
  }

  const trailingNumber = /(?:^|[^\d])(\d{1,4})(?=\.[^.]+$)/u.exec(name);
  if (trailingNumber) {
    return {
      season: null,
      episode: Number(trailingNumber[1])
    };
  }

  return null;
}

export function inferSequentialNextEpisodeIndex(items: PlaylistItem[], currentIndex: number): number {
  const current = items[currentIndex];
  if (!current?.episodeKey) {
    return inferNextEpisodeIndex(items, currentIndex);
  }

  const targetSeason = current.episodeKey.season;
  const targetEpisode = current.episodeKey.episode + 1;
  const nextIndex = items.findIndex(
    (item) =>
      item.episodeKey?.episode === targetEpisode &&
      (targetSeason === null || item.episodeKey.season === targetSeason)
  );

  return nextIndex >= 0 ? nextIndex : inferNextEpisodeIndex(items, currentIndex);
}

export function toMediaPresence(items: PlaylistItem[]): MediaPresenceItem[] {
  return items.map((item) => ({
    mediaId: item.id,
    name: item.name,
    size: item.size,
    durationMs: item.durationMs
  }));
}

export function toPlaylistEntries(items: PlaylistItem[]): PlaylistEntry[] {
  return items.map((item) => ({
    mediaId: item.id,
    name: item.name,
    size: item.size,
    durationMs: item.durationMs,
    episodeKey: item.episodeKey
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
