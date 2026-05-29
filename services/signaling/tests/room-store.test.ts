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
        displayName: "A"
      }).members
    ).toHaveLength(1);

    expect(
      store.join("LOVE1", {
        memberId: "b",
        displayName: "B"
      }).members
    ).toHaveLength(2);

    expect(store.leave("love1", "a")?.members.map((member) => member.memberId)).toEqual(["b"]);
    expect(store.leave("love1", "b")?.members).toEqual([]);
    expect(store.snapshot("love1").members).toEqual([]);
  });
});

