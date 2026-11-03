import { describe, expect, it } from "vitest";

import { doorCodesCopy } from "../src/content/copy";
import {
  FORMAT_PRESETS,
  blockedCodes,
  cleanCode,
  codeShows,
  codeSteps,
  doorsOn,
  formatChanged,
  generateCode,
  isWeakDigits,
  keepLocked,
  likelyCodes,
  normaliseDoorCodes,
  possibleCodes,
  presetOfFormat,
  spacedCode,
  staticCodeFor,
} from "../src/lib/door-codes";

const fmt = (over: Record<string, unknown> = {}) =>
  normaliseDoorCodes({ front: { mode: "per_stay", ...over } }).front;
const many = (over: Record<string, unknown>, n = 200) =>
  Array.from({ length: n }, () => generateCode(fmt(over), new Set())!);

describe("normaliseDoorCodes", () => {
  it("starts with both doors off, six digits ready", () => {
    const d = normaliseDoorCodes(null);
    expect(doorsOn(d)).toBe(false);
    expect(d.front).toMatchObject({ mode: "off", digits: 6, digitFrom: 0, digitTo: 9 });
    expect(d.reveal).toBe("check_in");
  });
  it("tidies what's saved", () => {
    const d = normaliseDoorCodes({
      front: {
        mode: "static",
        digits: 99,
        digitFrom: 7,
        digitTo: 2,
        letterFrom: "z",
        letterTo: "b",
        staticCode: " 12 34# ",
      },
      room: { mode: "static", roomCodes: { a: "9 9", b: "" } },
    });
    expect(d.front).toMatchObject({
      digits: 12,
      digitFrom: 2,
      digitTo: 7,
      letterFrom: "B",
      letterTo: "Z",
      staticCode: "1234#",
    });
    expect(d.room.roomCodes).toEqual({ a: "99" });
  });
  it("always leaves at least three characters", () => {
    expect(fmt({ digits: 0 }).digits).toBe(3);
    expect(fmt({ digits: 0, lettersStart: 3 }).digits).toBe(0);
  });
  it("reads a set-up saved before there were two doors", () => {
    const perStay = normaliseDoorCodes({ on: true, mode: "per_stay", digits: 4, pressAfter: "#" });
    expect(perStay.front).toMatchObject({ mode: "per_stay", digits: 4, pressAfter: "#" });
    expect(perStay.room.mode).toBe("off");
    const off = normaliseDoorCodes({ on: false, mode: "per_stay" });
    expect(doorsOn(off)).toBe(false);
    const rooms = normaliseDoorCodes({
      on: true,
      mode: "static",
      staticCode: "1111",
      roomCodes: { a: "2222" },
    });
    expect(rooms.front.staticCode).toBe("1111");
    expect(rooms.room).toMatchObject({ mode: "static", roomCodes: { a: "2222" } });
  });
});

describe("doors with no code", () => {
  it("a key note alone counts as something to tell guests", () => {
    expect(doorsOn(normaliseDoorCodes({ room: { keyNote: "Key in the safe" } }))).toBe(true);
  });
});

describe("locked fixed codes", () => {
  const prev = normaliseDoorCodes({
    front: { mode: "static", staticCode: "1111", locked: true },
    room: { mode: "static", roomCodes: { a: "2222" }, locked: false },
  });
  it("can't be changed while locked, whatever the page sends", () => {
    const sent = normaliseDoorCodes({
      front: { mode: "static", staticCode: "9999", locked: true },
      room: { mode: "static", roomCodes: { a: "8888" }, locked: false },
    });
    const kept = keepLocked(prev, sent);
    expect(kept.front.staticCode).toBe("1111");
    expect(kept.room.roomCodes).toEqual({ a: "8888" });
  });
  it("can be changed once the host unlocks them", () => {
    const sent = normaliseDoorCodes({
      front: { mode: "static", staticCode: "9999", locked: false },
    });
    expect(keepLocked(prev, sent).front.staticCode).toBe("9999");
  });
});

describe("lock types", () => {
  it("every preset is recognised, and has its words", () => {
    for (const p of FORMAT_PRESETS) {
      expect(presetOfFormat(p.format)).toBe(p.id);
      expect(doorCodesCopy.presets[p.id]).toHaveLength(2);
    }
    expect(presetOfFormat(fmt({ digits: 7 }))).toBeNull();
    expect(presetOfFormat({ ...FORMAT_PRESETS[0]!.format, memorable: false })).toBe("six");
  });
  it("a format change is noticed, turning memorable on or off isn't", () => {
    expect(formatChanged(fmt({ digits: 6 }), fmt({ digits: 4 }))).toBe(true);
    expect(formatChanged(fmt({ memorable: true }), fmt({ memorable: false }))).toBe(false);
  });
});

describe("generateCode", () => {
  it("fits the length and each button's range", () => {
    for (const c of many({ digits: 5, digitFrom: 1, digitTo: 3, memorable: false }))
      expect(c).toMatch(/^[1-3]{5}$/);
  });
  it("puts letters where the host asks", () => {
    for (const c of many({ lettersStart: 1, digits: 4, letterFrom: "A", letterTo: "D" }))
      expect(c).toMatch(/^[A-D]\d{4}$/);
    for (const c of many({ lettersEnd: 2, digits: 3, letterFrom: "X", letterTo: "Z" }))
      expect(c).toMatch(/^\d{3}[X-Z]{2}$/);
  });
  it("makes memorable shapes of six digits: 483483, 483384 or 448833", () => {
    for (const c of many({ digits: 6 })) {
      const [a, b, d, e, f, g] = [...c];
      const repeat = a === e && b === f && d === g;
      const mirror = a === g && b === f && d === e;
      const pairs = a === b && d === e && f === g;
      expect(repeat || mirror || pairs).toBe(true);
    }
  });
  it("is memorable at odd lengths too, and exact in length", () => {
    for (const n of [4, 5, 7, 8])
      for (const c of many({ digits: n }, 40)) expect(c).toHaveLength(n);
  });
  it("is plain when asked, and never one easily guessed", () => {
    for (const c of many({ digits: 4, memorable: false }, 500)) {
      expect(isWeakDigits(c, { digitFrom: 0, digitTo: 9 })).toBe(false);
    }
  });
  it("never gives a blocked code, finding the last free one", () => {
    const f = fmt({
      digits: 2,
      lettersEnd: 0,
      lettersStart: 1,
      letterFrom: "A",
      letterTo: "A",
      digitFrom: 1,
      digitTo: 2,
    });
    expect(possibleCodes(f)).toBe(4);
    expect(generateCode(f, new Set(["A11", "A12", "A21"]))).toBe("A22");
    expect(generateCode(f, new Set(["A11", "A12", "A21", "A22"]))).toBeNull();
  });
  it("works with very few buttons, where weak-looking codes are all there is", () => {
    const c = generateCode(fmt({ digits: 3, digitFrom: 1, digitTo: 1 }), new Set());
    expect(c).toBe("111");
  });
});

describe("likelyCodes", () => {
  it("counts what memorable patterns really leave", () => {
    expect(likelyCodes(fmt({ digits: 6 }))).toBe(10 * 9 * 8 * 3);
    expect(likelyCodes(fmt({ digits: 6, memorable: false }))).toBe(1_000_000);
    expect(likelyCodes(fmt({ digits: 4 }))).toBe(270);
  });
});

describe("isWeakDigits", () => {
  const all = { digitFrom: 0, digitTo: 9 };
  it("spots the obvious", () => {
    for (const d of ["1111", "123456", "987654", "1984", "2007"])
      expect(isWeakDigits(d, all)).toBe(true);
    for (const d of ["483483", "4477", "2580"]) expect(isWeakDigits(d, all)).toBe(false);
  });
});

describe("blockedCodes", () => {
  const T = "2026-11-03";
  const stay = (
    id: string,
    door_code: string,
    check_out_date: string,
    status = "upcoming",
    door_code_shown_at: string | null = "2026-01-01",
  ) => ({ id, door_code, check_out_date, status, door_code_shown_at });
  it("never shares with anyone here or still to come, whatever the reuse setting", () => {
    const s = [
      stay("here", "111", T, "checked_in"),
      stay("soon", "222", "2027-06-01"),
      stay("self", "333", "2027-06-01"),
    ];
    expect([...blockedCodes(s, "self", T, 30)].sort()).toEqual(["111", "222"]);
  });
  it("lets a past guest's code come round after the chosen time, not before", () => {
    const s = [
      stay("recent", "111", "2026-10-20", "checked_out"),
      stay("old", "222", "2026-01-01", "checked_out"),
    ];
    expect([...blockedCodes(s, "x", T, 90)]).toEqual(["111"]);
  });
  it("0 means never again", () => {
    const s = [stay("old", "222", "2019-01-01", "checked_out")];
    expect([...blockedCodes(s, "x", T, 0)]).toEqual(["222"]);
  });
  it("a past code no guest saw wasn't used, so it's free", () => {
    const s = [
      stay("unseen", "111", "2026-11-01", "checked_out", null),
      stay("seen", "222", "2026-11-01", "checked_out"),
    ];
    expect([...blockedCodes(s, "x", T, 90)]).toEqual(["222"]);
    expect([...blockedCodes(s, "x", T, 0)]).toEqual(["222"]);
  });
  it("a code held by someone still to come is blocked even if unseen", () => {
    expect([
      ...blockedCodes([stay("soon", "111", "2027-01-01", "upcoming", null)], "x", T, 90),
    ]).toEqual(["111"]);
  });
  it("blocks both doors' codes", () => {
    const s = [{ ...stay("soon", "111", "2027-01-01"), door_code_room: "222" }];
    expect([...blockedCodes(s, "x", T, 90)].sort()).toEqual(["111", "222"]);
  });
  it("a cancelled stay frees its code", () => {
    expect(blockedCodes([stay("c", "111", "2027-01-01", "cancelled")], "x", T, 90).size).toBe(0);
  });
});

describe("what the guest sees", () => {
  it("tells them what to press", () => {
    expect(codeSteps({ pressBefore: "*", pressAfter: "#" }, "483 483")).toEqual([
      "Press *",
      "Enter 483 483",
      "Press #",
    ]);
    expect(codeSteps({ pressBefore: "", pressAfter: "" }, "1234")).toEqual(["Enter 1234"]);
  });
  it("spaces long codes", () => {
    expect(spacedCode("483483")).toBe("483 483");
    expect(spacedCode("48324832")).toBe("4832 4832");
    expect(spacedCode("1234")).toBe("1234");
    expect(spacedCode("B483483")).toBe("B 483 483");
    expect(spacedCode("48348XY")).toBe("483 48 XY");
  });
  it("fixed codes: the front door's for all, the room door's by room", () => {
    const f = normaliseDoorCodes({
      front: { mode: "static", staticCode: "1111" },
      room: { mode: "static", roomCodes: { a: "2222" } },
    });
    expect(staticCodeFor(f, "front", "a")).toBe("1111");
    expect(staticCodeFor(f, "room", "a")).toBe("2222");
    expect(staticCodeFor(f, "room", "b")).toBe("");
  });
  it("cleans a typed code", () => {
    expect(cleanCode("ab 12-#")).toBe("AB12#");
  });
  const when = { opensAtMs: 100, endsAtMs: 200, nowMs: 150, checkedIn: false, checkedOut: false };
  it("shows on arrival day or after check-in, as the host chooses", () => {
    expect(codeShows({ reveal: "arrival_day" }, when)).toBe(true);
    expect(codeShows({ reveal: "check_in" }, when)).toBe(false);
    expect(codeShows({ reveal: "check_in" }, { ...when, checkedIn: true })).toBe(true);
  });
  it("never before arrival day or once they've left", () => {
    const f = { reveal: "arrival_day" as const };
    expect(codeShows(f, { ...when, nowMs: 50 })).toBe(false);
    expect(codeShows(f, { ...when, nowMs: 250 })).toBe(false);
    expect(codeShows(f, { ...when, checkedOut: true })).toBe(false);
  });
});
