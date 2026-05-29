import { describe, expect, it } from "vitest";
import {
  countPeersWithMedia,
  formatBytes,
  formatTime,
  inferEpisodeKey,
  inferNextEpisodeIndex,
  inferSequentialNextEpisodeIndex,
  toMediaPresence,
  toPlaylistEntries
} from "./media";

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
    { id: "1", name: "Show.S01E01.mkv", size: 1, lastModified: 1, url: "blob:1", episodeKey: { season: 1, episode: 1 } },
    { id: "2", name: "Show.S01E02.mkv", size: 1, lastModified: 1, url: "blob:2", episodeKey: { season: 1, episode: 2 } }
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
      {
        id: "quick:1",
        name: "Show.S01E01.mp4",
        size: 1024,
        lastModified: 1,
        url: "blob:local",
        durationMs: 60_000,
        episodeKey: { season: 1, episode: 1 }
      }
    ]);

    expect(presence).toEqual([
      {
        mediaId: "quick:1",
        name: "Show.S01E01.mp4",
        size: 1024,
        durationMs: 60_000
      }
    ]);
  });

  it("maps playlist items into room playlist entries", () => {
    expect(
      toPlaylistEntries([
        {
          id: "quick:1",
          name: "Show.S01E01.mp4",
          size: 1024,
          lastModified: 1,
          url: "blob:local",
          durationMs: 60_000,
          episodeKey: { season: 1, episode: 1 }
        }
      ])
    ).toEqual([
      {
        mediaId: "quick:1",
        name: "Show.S01E01.mp4",
        size: 1024,
        durationMs: 60_000,
        episodeKey: { season: 1, episode: 1 }
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
