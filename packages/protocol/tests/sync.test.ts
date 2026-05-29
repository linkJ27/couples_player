import { describe, expect, it } from "vitest";
import {
  classifyDrift,
  calculatePlaybackDrift,
  createPlaybackSnapshot,
  estimateClockOffset,
  projectMediaTime,
  quickMediaFingerprint,
  resolveCommandOrder
} from "../src";

describe("playback time projection", () => {
  it("projects media time from an anchor when playing", () => {
    const snapshot = createPlaybackSnapshot({
      state: "playing",
      mediaId: "media-1",
      mediaTimeMs: 10_000,
      roomTimeMs: 1_000,
      playbackRate: 1.5,
      leaderId: "a"
    });

    expect(projectMediaTime(snapshot, 3_000)).toBe(13_000);
  });

  it("keeps media time stable when paused", () => {
    const snapshot = createPlaybackSnapshot({
      state: "paused",
      mediaId: "media-1",
      mediaTimeMs: 10_000,
      roomTimeMs: 1_000,
      leaderId: "a"
    });

    expect(projectMediaTime(snapshot, 30_000)).toBe(10_000);
  });
});

describe("drift classification", () => {
  it("calculates drift against projected room time", () => {
    const snapshot = createPlaybackSnapshot({
      state: "playing",
      mediaId: "media-1",
      mediaTimeMs: 1_000,
      roomTimeMs: 10_000,
      leaderId: "a"
    });

    expect(
      calculatePlaybackDrift({
        snapshot,
        roomTimeMs: 11_000,
        localMediaTimeMs: 1_250
      })
    ).toBe(750);
  });

  it("ignores small drift", () => {
    expect(classifyDrift(60)).toEqual({ correction: "none", temporaryRate: 1 });
  });

  it("uses rate nudges for medium drift", () => {
    expect(classifyDrift(120)).toEqual({ correction: "speed-up", temporaryRate: 1.03 });
    expect(classifyDrift(-120)).toEqual({ correction: "slow-down", temporaryRate: 0.97 });
  });

  it("seeks for large drift", () => {
    expect(classifyDrift(400)).toEqual({ correction: "seek", temporaryRate: 1 });
  });
});

describe("clock and command ordering", () => {
  it("estimates remote clock offset with round trip latency", () => {
    expect(
      estimateClockOffset({
        localSentMs: 100,
        remoteReceivedMs: 220,
        localReceivedMs: 180
      })
    ).toBe(80);
  });

  it("chooses the newest command by epoch, clock, then sender", () => {
    const base = {
      commandId: "a",
      senderId: "client-a",
      epoch: 1,
      logicalClock: 2,
      issuedRoomTimeMs: 100,
      action: "pause" as const
    };

    expect(resolveCommandOrder(base, { ...base, commandId: "b", epoch: 2 }).commandId).toBe("b");
    expect(
      resolveCommandOrder(base, {
        ...base,
        commandId: "c",
        logicalClock: 3
      }).commandId
    ).toBe("c");
    expect(
      resolveCommandOrder(base, {
        ...base,
        commandId: "d",
        senderId: "client-z"
      }).commandId
    ).toBe("d");
  });
});

describe("quick media fingerprint", () => {
  it("is stable for the same metadata", () => {
    const input = {
      name: "Show.S01E01.mkv",
      size: 1024,
      lastModified: 123,
      durationMs: 42_000
    };

    expect(quickMediaFingerprint(input)).toEqual(quickMediaFingerprint(input));
  });
});
