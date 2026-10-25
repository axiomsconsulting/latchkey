import { describe, expect, it } from "vitest";
import { newRoomWords, readRoomWords, ROOM_CODE, ROOM_WORDS } from "@/lib/room-words";

describe("three-word room codes", () => {
  it("has a big, clean word list", () => {
    expect(ROOM_WORDS.length).toBeGreaterThan(500);
    expect(new Set(ROOM_WORDS).size).toBe(ROOM_WORDS.length);
    expect(ROOM_WORDS.every((w) => /^[a-z]{3,11}$/.test(w))).toBe(true);
  });
  it("makes three different words", () => {
    let i = 0;
    const seq = [0, 0, 0.5, 0.99];
    const code = newRoomWords(() => seq[i++ % seq.length]!);
    expect(code.split("-")).toHaveLength(3);
    expect(new Set(code.split("-")).size).toBe(3);
    expect(ROOM_CODE.test(code)).toBe(true);
  });
  it("reads codes however they're typed", () => {
    expect(readRoomWords("Amber Otter Harbour")).toBe("amber-otter-harbour");
    expect(readRoomWords("amber.otter.harbour")).toBe("amber-otter-harbour");
    expect(readRoomWords("amber-otter")).toBeNull();
    expect(readRoomWords("amber-otter-zzzz")).toBeNull();
    expect(ROOM_CODE.test("faurn9ffm6nx")).toBe(true);
  });
});
