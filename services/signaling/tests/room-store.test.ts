import { describe, expect, it } from "vitest";
import { RoomStore, normalizeRoomId } from "../src/room-store";

describe("normalizeRoomId", () => {
  it("keeps only stable uppercase room characters", () => {
    expect(normalizeRoomId(" ab-12 cd ")).toBe("AB12CD");
  });
});

describe("RoomStore", () => {
  it("tracks members joining and leaving rooms", () => {
    const store = new RoomStore();

    expect(
      store.join("love1", {
        memberId: "a",
        sessionId: "s-a",
        displayName: "A"
      }).members
    ).toHaveLength(1);

    expect(
      store.join("LOVE1", {
        memberId: "b",
        sessionId: "s-b",
        displayName: "B"
      }).members
    ).toHaveLength(2);

    expect(store.snapshot("love1").leaderId).toBe("a");
    expect(store.canBroadcastPlayback("love1", "a")).toBe(true);
    expect(store.canBroadcastPlayback("love1", "b")).toBe(false);
    store.setMode("love1", "free");
    expect(store.canBroadcastPlayback("love1", "b")).toBe(true);
    store.claimLeader("love1", "b");
    expect(store.snapshot("love1").leaderId).toBe("b");
    const playbackSnapshot = {
      version: 1,
      epoch: 1,
      state: "playing" as const,
      mediaId: "quick:test",
      anchorMediaTimeMs: 1200,
      anchorRoomTimeMs: 3000,
      playbackRate: 1,
      leaderId: "b"
    };
    store.updatePlayback("love1", playbackSnapshot);
    expect(store.toMessage("love1")).toMatchObject({
      roomId: "LOVE1",
      peerCount: 2,
      mode: "free",
      leaderId: "b",
      playbackSnapshot
    });
    expect(store.leave("love1", "a")?.members.map((member) => member.memberId)).toEqual(["b"]);
    expect(store.leave("love1", "b")?.members).toEqual([]);
    expect(store.snapshot("love1").members).toEqual([]);
  });
});
