/** Private files in Google Drive (private-store.ts): references, folders and signed links. */
import { describe, expect, it } from "vitest";

import {
  REF_COLUMNS,
  STORE_GROUPS,
  driveRef,
  ownerFolderName,
  queueRef,
  readRef,
  refAllowed,
  safePart,
  sha256OfBytes,
  signPrivateLink,
  verifyPrivateLink,
} from "../src/lib/private-store";

const parse = (url: string) => {
  const u = new URL(url, "https://x.test");
  return {
    r: u.pathname.split("/").pop()!,
    e: Number(u.searchParams.get("e")),
    n: u.searchParams.get("n")!,
    s: u.searchParams.get("s")!,
  };
};

describe("private files", () => {
  it("know where a file is from its reference", () => {
    expect(readRef(driveRef("abc"))).toEqual({ where: "drive", fileId: "abc" });
    expect(readRef(queueRef("guest_id/h/x.jpg"))).toEqual({
      where: "queue",
      path: "guest_id/h/x.jpg",
    });
    expect(readRef("booking/id-1.jpg")).toEqual({ where: "legacy", path: "booking/id-1.jpg" });
  });

  it("keep guests, partner IDs and partner agreements in separate folders", () => {
    expect(STORE_GROUPS.guest_id.key).toBe(STORE_GROUPS.guest_face.key);
    expect(new Set(Object.values(STORE_GROUPS).map((g) => g.key)).size).toBe(3);
    expect(ownerFolderName("host-1", "The Hill/Suites")).toBe("host-1 · The Hill-Suites");
  });

  it("only update the columns that hold private files", () => {
    expect(refAllowed("guest_ids", "id_photo_path")).toBe(true);
    expect(refAllowed("partner_agreement_acceptances", "pdf_path")).toBe(true);
    expect(refAllowed("bookings", "guest_full_name")).toBe(false);
    expect(Object.keys(REF_COLUMNS)).toHaveLength(3);
  });

  it("make safe file names", () => {
    expect(safePart("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(safePart("")).toBe("file");
  });

  it("sign links for one file that expire", async () => {
    const now = 1_800_000_000;
    const link = await signPrivateLink("secret", "drive:abc", now + 600, "id.jpg");
    const p = parse(link);
    expect(await verifyPrivateLink("secret", p.r, p.e, p.n, p.s, now)).toBe("drive:abc");
    expect(await verifyPrivateLink("secret", p.r, p.e, p.n, p.s, now + 601)).toBeNull();
    expect(await verifyPrivateLink("other", p.r, p.e, p.n, p.s, now)).toBeNull();
    const other = parse(await signPrivateLink("secret", "drive:xyz", now + 600, "id.jpg"));
    expect(await verifyPrivateLink("secret", other.r, p.e, p.n, p.s, now)).toBeNull();
  });

  it("hash bytes the way Drive reports them", async () => {
    expect(await sha256OfBytes(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
