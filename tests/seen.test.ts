import { describe, expect, it } from "vitest";

import { markSeen, readSeen, unseen } from "../src/lib/seen";

describe("new badges", () => {
  it("counts nothing before the first visit, then only what arrived since", () => {
    expect(unseen(["a", "b"], undefined)).toEqual([]);
    expect(unseen(["a", "b", "c"], ["a", "b"])).toEqual(["c"]);
  });

  it("remembers what's been seen, newest kept", () => {
    expect(markSeen(["a"], ["a", "b"])).toEqual(["a", "b"]);
    expect(markSeen(undefined, ["x"])).toEqual(["x"]);
    expect(markSeen(["a", "b", "c"], ["d"], 2)).toEqual(["c", "d"]);
  });

  it("reads only good stored data", () => {
    expect(readSeen('{"inbox":["a",1]}')).toEqual({ inbox: ["a"] });
    expect(readSeen("nonsense")).toEqual({});
    expect(readSeen(null)).toEqual({});
  });
});
