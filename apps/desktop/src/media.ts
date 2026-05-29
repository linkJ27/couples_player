import { quickMediaFingerprint } from "@couples-player/protocol";
import type {
  EpisodeKey,
  FileMatchResult,
  MediaPresenceItem,
  MemberMediaPresence,
  PlaylistEntry
} from "@couples-player/protocol";

export interface PlaylistItem {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  url: string;
  file: File;
  fingerprintConfidence: FileMatchResult["confidence"];
  fingerprintStatus: "pending" | "ready" | "hashing" | "error";
  durationMs?: number;
  episodeKey: EpisodeKey | null;
}

const defaultSegmentSizeBytes = 256 * 1024;

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
      file,
      fingerprintConfidence: fingerprint.confidence,
      fingerprintStatus: "pending",
      episodeKey: inferEpisodeKey(file.name)
    };
  });
}

export async function createSegmentedFileFingerprint(
  file: File,
  segmentSizeBytes = defaultSegmentSizeBytes
): Promise<FileMatchResult> {
  const segmentSize = Math.max(1, segmentSizeBytes);
  const offsets = createSegmentOffsets(file.size, segmentSize);
  const segments = await Promise.all(
    offsets.map(async (offset) => {
      const length = Math.min(segmentSize, file.size - offset);
      const sha256 = await sha256Hex(await readBlobArrayBuffer(file.slice(offset, offset + length)));
      return `${offset}:${length}:${sha256}`;
    })
  );
  const digest = await sha256Hex(new TextEncoder().encode(`seg256:v1:${file.size}:${segments.join("|")}`));

  return {
    mediaId: `seg256:${digest}`,
    label: file.name,
    confidence: "segmented"
  };
}

export async function createStrictFileFingerprint(file: File): Promise<FileMatchResult> {
  const digest = await sha256Hex(await readBlobArrayBuffer(file));

  return {
    mediaId: `sha256:${digest}`,
    label: file.name,
    confidence: "strict"
  };
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
    durationMs: item.durationMs,
    fingerprintConfidence: item.fingerprintConfidence
  }));
}

export function toPlaylistEntries(items: PlaylistItem[]): PlaylistEntry[] {
  return items.map((item) => ({
    mediaId: item.id,
    name: item.name,
    size: item.size,
    durationMs: item.durationMs,
    episodeKey: item.episodeKey,
    fingerprintConfidence: item.fingerprintConfidence
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

function createSegmentOffsets(fileSize: number, segmentSize: number): number[] {
  if (fileSize <= 0) {
    return [0];
  }

  return Array.from(
    new Set([
      0,
      Math.max(0, Math.floor(fileSize / 2 - segmentSize / 2)),
      Math.max(0, fileSize - segmentSize)
    ])
  ).sort((left, right) => left - right);
}

async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read file")));
    reader.readAsArrayBuffer(blob);
  });
}
