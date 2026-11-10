import { describe, expect, it } from "vitest";

import { nationalityOptions } from "../src/lib/hotel-register";
import {
  SHOW_MATCHES,
  countryKey,
  flagEmoji,
  narrowCountries,
  pageReady,
  registerPages,
} from "../src/lib/kiosk-register";
import { handoffView, maySave, normaliseHandoff } from "../src/lib/checkin-handoff";

describe("the register a page at a time", () => {
  const all = () => true;
  it("asks name and nationality, then an alien's details once that nationality is picked", () => {
    expect(registerPages(all, false)).toEqual(["name", "nationality"]);
    expect(registerPages(all, true)).toEqual([
      "name",
      "nationality",
      "document",
      "place",
      "destination",
      "address",
    ]);
    // Going home: the address comes with it, so there's no address page.
    expect(registerPages(all, true, true)).toEqual([
      "name",
      "nationality",
      "document",
      "place",
      "destination",
    ]);
    // Read from the ID: only the missing destination is asked.
    expect(registerPages((k) => k === "destination", true)).toEqual(["destination", "address"]);
  });
  it("moves on once the page's own answer is there; the address is optional", () => {
    expect(pageReady("name", ["nationality"])).toBe(true);
    expect(pageReady("nationality", ["nationality"])).toBe(false);
    expect(pageReady("address", ["destination"])).toBe(true);
  });
});

describe("nationality by letters", () => {
  const options = nationalityOptions();
  it("flags from codes; British statuses get the UK's, unknown a white flag", () => {
    expect(flagEmoji("FR")).toBe("🇫🇷");
    expect(flagEmoji("GB-OTC")).toBe("🇬🇧");
    expect(flagEmoji("XX")).toBe("🏳️");
  });
  it("types names without accents or marks", () => {
    expect(countryKey("Côte d’Ivoire")).toBe("COTE DIVOIRE");
    expect(countryKey("Guinea-Bissau")).toBe("GUINEA BISSAU");
  });
  it("each letter narrows the list, offering only keys that lead somewhere", () => {
    const f = narrowCountries(options, "F");
    expect(f.matches.map((o) => o.code)).toContain("FR");
    expect(f.next).not.toContain("Z");
    const fr = narrowCountries(options, "FR");
    expect(fr.matches.length).toBeLessThanOrEqual(SHOW_MATCHES);
    expect(fr.matches.some((o) => o.code === "FR")).toBe(true);
    const united = narrowCountries(options, "UNITED");
    expect(united.next).toEqual([" "]);
    expect(narrowCountries(options, "UNITED S").matches.map((o) => o.code)).toContain("US");
  });
});

describe("one check-in on the tablet and a phone", () => {
  it("keeps only real steps, and register details only for people still to do", () => {
    const s = normaliseHandoff({
      steps: [
        { kind: "register", position: 0, child: false, only: ["destination", "bogus"] },
        { kind: "face", position: 1 },
        { kind: "hack", position: 2 },
        { kind: "companion", position: -1 },
      ],
      prefill: {
        "0": {
          fullName: "Ana Silva",
          nationality: "BR",
          documentNumber: "X123",
          placeOfIssue: "Rio",
        },
        "5": { fullName: "Not Needed" },
      },
    });
    expect(s).toEqual({
      steps: [
        { kind: "register", position: 0, child: false, only: ["destination"] },
        { kind: "face", position: 1 },
      ],
      prefill: {
        "0": {
          fullName: "Ana Silva",
          nationality: "BR",
          documentNumber: "X123",
          placeOfIssue: "Rio",
          homeAddress: null,
          homeTown: null,
        },
      },
    });
    expect(normaliseHandoff(null)).toBeNull();
  });
  it("only the device in control saves; the other waits until it takes over", () => {
    expect(maySave(null, "kiosk")).toBe(true);
    expect(maySave("phone", "kiosk")).toBe(false);
    expect(handoffView("kiosk", { at: "phone", completed: false })).toBe("elsewhere");
    expect(handoffView("phone", { at: "phone", completed: false })).toBe("mine");
    expect(handoffView("kiosk", { at: "phone", completed: true })).toBe("done");
  });
});
