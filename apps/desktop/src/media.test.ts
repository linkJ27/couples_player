import { describe, expect, it } from "vitest";
import { formatBytes, formatTime, inferNextEpisodeIndex } from "./media";

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
    { id: "1", name: "e1.mkv", size: 1, lastModified: 1, url: "blob:1" },
    { id: "2", name: "e2.mkv", size: 1, lastModified: 1, url: "blob:2" }
  ];

  it("moves to the next item and wraps", () => {
    expect(inferNextEpisodeIndex(items, 0)).toBe(1);
    expect(inferNextEpisodeIndex(items, 1)).toBe(0);
    expect(inferNextEpisodeIndex([], 0)).toBe(-1);
  });
});

