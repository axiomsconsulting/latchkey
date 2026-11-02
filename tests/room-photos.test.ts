import { describe, expect, it } from "vitest";

import {
  aiPhotoAccess,
  groupBySpace,
  normaliseSpace,
  roomGallery,
  type RoomPhoto,
} from "@/lib/room-photos";

const p = (
  id: string,
  space: RoomPhoto["space"],
  roomId: string | null,
  position = 0,
): RoomPhoto => ({
  id,
  roomId,
  space,
  caption: null,
  url: `https://x.test/${id}.jpg`,
  position,
});

describe("room photos by space", () => {
  it("groups in the spaces' order, keeping the host's order inside", () => {
    const g = groupBySpace([
      p("b2", "bathroom", "r"),
      p("a2", "bedroom", "r", 2),
      p("a1", "bedroom", "r", 1),
    ]);
    expect(g.map((x) => [x.space, x.photos.map((y) => y.id)])).toEqual([
      ["bedroom", ["a1", "a2"]],
      ["bathroom", ["b2"]],
    ]);
    expect(normaliseSpace("attic")).toBe("other");
  });

  it("shows a room's own photos and the shared spaces, with the cover first when it isn't there", () => {
    const photos = [p("k", "kitchen", null), p("b", "bathroom", "r1"), p("x", "bedroom", "r2")];
    const g = roomGallery("r1", photos, "https://x.test/cover.jpg");
    expect(g.all.map((x) => x.id)).toEqual(["cover-r1", "b", "k"]);
    expect(g.groups.map((x) => x.space)).toEqual(["bedroom", "bathroom", "kitchen"]);
    expect(roomGallery("r1", [], null).all).toEqual([]);
  });

  it("gives AI sorting with the feature, or once on two rooms to try", () => {
    expect(aiPhotoAccess({ hasFeature: true, triedRooms: ["a", "b"], roomKey: "a" }).allowed).toBe(
      true,
    );
    expect(aiPhotoAccess({ hasFeature: false, triedRooms: [], roomKey: "a" })).toEqual({
      allowed: true,
      trial: true,
      trialLeft: 2,
    });
    expect(aiPhotoAccess({ hasFeature: false, triedRooms: ["a"], roomKey: "a" }).allowed).toBe(
      false,
    );
    expect(aiPhotoAccess({ hasFeature: false, triedRooms: ["a", "b"], roomKey: "c" }).allowed).toBe(
      false,
    );
  });
});
