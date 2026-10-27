import { describe, expect, it } from "vitest";

import {
  LATEST_VERSION,
  RELEASES,
  compareVersions,
  featuresByArea,
  releaseLevel,
  releasesFor,
  unseen,
} from "../src/content/changelog";

describe("change log", () => {
  it("lists each version once as major.minor.fix, newest first, with real dates", () => {
    expect(new Set(RELEASES.map((r) => r.version)).size).toBe(RELEASES.length);
    for (const r of RELEASES) expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < RELEASES.length; i++)
      expect(compareVersions(RELEASES[i - 1]!.version, RELEASES[i]!.version)).toBe(1);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const d of dates) expect(Number.isNaN(Date.parse(d))).toBe(false);
    for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
    expect(LATEST_VERSION).toBe(RELEASES[0]!.version);
  });

  it("builds the features log from every new item", () => {
    const total = RELEASES.flatMap((r) => r.items).filter((i) => i.kind === "new").length;
    expect(featuresByArea().reduce((n, g) => n + g.features.length, 0)).toBe(total);
  });
});

describe("versions", () => {
  it("compares numerically and names each release's level", () => {
    expect(compareVersions("0.10.0", "0.9.3")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(releaseLevel("1.0.0", "0.33.0")).toBe("major");
    expect(releaseLevel("0.34.0", "0.33.2")).toBe("minor");
    expect(releaseLevel("0.33.1", "0.33.0")).toBe("fix");
  });

  it("keeps super-admin items away from hosts", () => {
    const hosts = releasesFor({ admin: false }).flatMap((r) => r.items);
    expect(hosts.some((i) => i.admin)).toBe(false);
    expect(hosts.some((i) => i.text.startsWith("Latchkey admin"))).toBe(false);
    expect(releasesFor({ admin: true }).flatMap((r) => r.items).length).toBe(
      RELEASES.flatMap((r) => r.items).length,
    );
  });

  it("shows only what's new since last seen, and nothing to brand-new hosts", () => {
    const all = releasesFor({ admin: false });
    expect(unseen(null, all)).toEqual([]);
    expect(unseen(LATEST_VERSION, all)).toEqual([]);
    const older = all[2]!.version;
    expect(unseen(older, all).map((r) => r.version)).toEqual(all.slice(0, 2).map((r) => r.version));
  });
});
