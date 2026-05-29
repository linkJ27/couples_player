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
        displayName: "A",
        media: []
      }).members
    ).toHaveLength(1);

    expect(
      store.join("LOVE1", {
        memberId: "b",
        sessionId: "s-b",
        displayName: "B",
        media: []
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
    store.updateMediaPresence("love1", "a", [
      {
        mediaId: "quick:e1",
        name: "Show.S01E01.mp4",
        size: 1024
      }
    ]);
    store.updateMediaPresence("love1", "b", [
      {
        mediaId: "quick:e1",
        name: "Different.Name.mp4",
        size: 1024
      },
      {
        mediaId: "quick:e2",
        name: "Show.S01E02.mp4",
        size: 2048
      }
    ]);
    expect(store.hasPeerMedia("love1", "a", "quick:e1")).toBe(true);
    expect(store.hasPeerMedia("love1", "a", "quick:e2")).toBe(true);
    expect(store.hasPeerMedia("love1", "b", "quick:e2")).toBe(false);
    store.updatePlaylist("love1", [
      {
        mediaId: "quick:e1",
        name: "Show.S01E01.mp4",
        size: 1024,
        episodeKey: { season: 1, episode: 1 }
      },
      {
        mediaId: "quick:e1",
        name: "Duplicate.mp4",
        size: 1024,
        episodeKey: { season: 1, episode: 1 }
      }
    ]);
    expect(store.toMessage("love1")).toMatchObject({
      roomId: "LOVE1",
      peerCount: 2,
      mode: "free",
      leaderId: "b",
      playlistVersion: 1,
      playlist: [{ mediaId: "quick:e1", name: "Show.S01E01.mp4" }],
      playbackSnapshot,
      mediaPresence: [
        {
          memberId: "a",
          media: [{ mediaId: "quick:e1" }]
        },
        {
          memberId: "b",
          media: [{ mediaId: "quick:e1" }, { mediaId: "quick:e2" }]
        }
      ]
    });
    expect(store.leave("love1", "a")?.members.map((member) => member.memberId)).toEqual(["b"]);
    expect(store.leave("love1", "b")?.members).toEqual([]);
    expect(store.snapshot("love1").members).toEqual([]);
  });
});
