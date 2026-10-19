import { describe, expect, it } from "vitest";

import { displayName, extensionOf, kindFor, signAttachment, storedName, verifyAttachment } from "../src/lib/attachments";

describe("guide attachments", () => {
  it("only takes what guests can see in the app", () => {
    expect(kindFor("image/jpeg")).toBe("image");
    expect(kindFor("application/pdf")).toBe("pdf");
    expect(kindFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("doc");
    expect(kindFor("application/zip")).toBeNull();
    expect(kindFor("video/mp4")).toBeNull();
  });

  it("names files by section and id in the host's folder", () => {
    expect(storedName("parking", "a1b2", "Car Park Map.PNG")).toBe("parking-a1b2.png");
    expect(extensionOf("no-extension")).toBe("bin");
    expect(displayName("fire_exit-map.pdf")).toBe("fire exit map");
  });

  it("signs links that expire and can't be altered", async () => {
    const now = 1_800_000_000;
    const link = await signAttachment("secret", "abc", now + 60);
    const sig = new URL(link, "https://x").searchParams.get("s")!;
    expect(await verifyAttachment("secret", "abc", now + 60, sig, now)).toBe(true);
    expect(await verifyAttachment("secret", "abd", now + 60, sig, now)).toBe(false);
    expect(await verifyAttachment("other", "abc", now + 60, sig, now)).toBe(false);
    expect(await verifyAttachment("secret", "abc", now + 60, sig, now + 61)).toBe(false);
  });
});
