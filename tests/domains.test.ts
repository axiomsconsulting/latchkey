import { describe, expect, it } from "vitest";

import { isPlatformDomain, normaliseDomain, txtMatches, verifyRecord } from "../src/lib/domains";

describe("host domains", () => {
  it("cleans what people paste", () => {
    expect(normaliseDomain("https://Stay.Hill-Suites.co.uk/path?x=1")).toBe("stay.hill-suites.co.uk");
    expect(normaliseDomain("hillsuites.com.")).toBe("hillsuites.com");
    expect(normaliseDomain("checkin.hillsuites.com:443")).toBe("checkin.hillsuites.com");
  });

  it("refuses things that aren't domains", () => {
    for (const bad of ["", "localhost", "hill suites.com", "-bad.com", "192.168.0.1", "a..b.com"]) expect(normaliseDomain(bad)).toBeNull();
  });

  it("never lets a host take the platform's own domains", () => {
    expect(isPlatformDomain("latchkey.omsestates.uk")).toBe(true);
    expect(isPlatformDomain("myapp.lovable.app")).toBe(true);
    expect(isPlatformDomain("stay.hillsuites.com")).toBe(false);
  });

  it("checks the proof record, quoted or split as DNS returns it", () => {
    const r = verifyRecord("stay.hillsuites.com", "abc123");
    expect(r.name).toBe("_latchkey-verify.stay.hillsuites.com");
    expect(txtMatches(['"latchkey-verify=abc123"'], r.value)).toBe(true);
    expect(txtMatches(['"latchkey-" "verify=abc123"'], r.value)).toBe(true);
    expect(txtMatches(['"something-else"'], r.value)).toBe(false);
  });
});
