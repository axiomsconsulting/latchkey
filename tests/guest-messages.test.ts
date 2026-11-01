import { describe, expect, it } from "vitest";

import { normaliseWhatsApp } from "@/lib/guest-messages";

describe("WhatsApp settings from Latchkey admin", () => {
  it("keeps only a real sender and Twilio template ids", () => {
    const w = normaliseWhatsApp(
      { sender: "+447700900123", templates: { welcome: "HX" + "a".repeat(32), goodbye: "nope" } },
      null,
    );
    expect(w.sender).toBe("+447700900123");
    expect(w.templates.welcome).toBe("HX" + "a".repeat(32));
    expect(w.templates.goodbye).toBeNull();
    expect(w.templates.photo_link).toBeNull();
  });

  it("falls back to the server's shared sender", () => {
    expect(normaliseWhatsApp(null, "whatsapp:+447700900999").sender).toBe("+447700900999");
    expect(normaliseWhatsApp({ sender: "07700" }, null).sender).toBeNull();
  });
});
