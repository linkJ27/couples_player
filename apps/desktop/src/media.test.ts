import { describe, expect, it } from "vitest";
import {
  createSegmentedFileFingerprint,
  createStrictFileFingerprint,
  countPeersWithMedia,
  formatBytes,
  formatTime,
  inferEpisodeKey,
  inferNextEpisodeIndex,
  inferSequentialNextEpisodeIndex,
  toMediaPresence,
  toPlaylistEntries
} from "./media";
import type { PlaylistItem } from "./media";

describe("media formatting", () => {
  it("formats playback time", () => {
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3661)).toBe("1:01:01");
    expect(formatTime(Number.NaN)).toBe("00:00");
  });

  it("formats file sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
  });
});

describe("playlist navigation", () => {
  const items = [
    makePlaylistItem("1", "Show.S01E01.mkv", { season: 1, episode: 1 }),
    makePlaylistItem("2", "Show.S01E02.mkv", { season: 1, episode: 2 })
  ];

  it("moves to the next item and wraps", () => {
    expect(inferNextEpisodeIndex(items, 0)).toBe(1);
    expect(inferNextEpisodeIndex(items, 1)).toBe(0);
    expect(inferNextEpisodeIndex([], 0)).toBe(-1);
  });

  it("detects episode keys and prefers the next numbered episode", () => {
    expect(inferEpisodeKey("Show.S02E003.mkv")).toEqual({ season: 2, episode: 3 });
    expect(inferEpisodeKey("剧集 第12集.mp4")).toEqual({ season: null, episode: 12 });
    expect(inferEpisodeKey("Show.07.mkv")).toEqual({ season: null, episode: 7 });
    expect(inferSequentialNextEpisodeIndex(items, 0)).toBe(1);
  });
});

describe("media presence", () => {
  it("maps playlist items into shareable presence without local paths", () => {
    const presence = toMediaPresence([
      makePlaylistItem("quick:1", "Show.S01E01.mp4", { season: 1, episode: 1 }, 60_000)
    ]);

    expect(presence).toEqual([
      {
        mediaId: "quick:1",
        name: "Show.S01E01.mp4",
        size: 1024,
        durationMs: 60_000,
        fingerprintConfidence: "quick"
      }
    ]);
  });

  it("maps playlist items into room playlist entries", () => {
    expect(
      toPlaylistEntries([
        makePlaylistItem("quick:1", "Show.S01E01.mp4", { season: 1, episode: 1 }, 60_000)
      ])
    ).toEqual([
      {
        mediaId: "quick:1",
        name: "Show.S01E01.mp4",
        size: 1024,
        durationMs: 60_000,
        episodeKey: { season: 1, episode: 1 },
        fingerprintConfidence: "quick"
      }
    ]);
  });

  it("counts only peers who have the requested media", () => {
    expect(
      countPeersWithMedia(
        "quick:1",
        [
          { memberId: "local", displayName: "Local", media: [{ mediaId: "quick:1", name: "a", size: 1 }] },
          { memberId: "peer-a", displayName: "A", media: [{ mediaId: "quick:1", name: "b", size: 1 }] },
          { memberId: "peer-b", displayName: "B", media: [{ mediaId: "quick:2", name: "c", size: 1 }] }
        ],
        "local"
      )
    ).toBe(1);
  });
});

describe("file fingerprints", () => {
  it("creates the same segmented fingerprint for identical content with different names", async () => {
    const left = new File(["same-media-bytes"], "Show.S01E01.mkv");
    const right = new File(["same-media-bytes"], "Renamed Episode.mkv");

    expect((await createSegmentedFileFingerprint(left, 4)).mediaId).toBe(
      (await createSegmentedFileFingerprint(right, 4)).mediaId
    );
  });

  it("creates a strict SHA-256 fingerprint for the whole file", async () => {
    const fingerprint = await createStrictFileFingerprint(new File(["abc"], "clip.mkv"));

    expect(fingerprint).toEqual({
      mediaId: "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      label: "clip.mkv",
      confidence: "strict"
    });
  });
});

function makePlaylistItem(
  id: string,
  name: string,
  episodeKey: PlaylistItem["episodeKey"],
  durationMs?: number
): PlaylistItem {
  return {
    id,
    name,
    size: 1024,
    lastModified: 1,
    url: `blob:${id}`,
    file: new File(["video"], name),
    fingerprintConfidence: "quick",
    fingerprintStatus: "ready",
    durationMs,
    episodeKey
  };
}
