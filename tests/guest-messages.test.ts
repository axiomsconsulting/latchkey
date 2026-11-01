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

describe("welcome and goodbye messages", async () => {
  const {
    DEFAULT_GUEST_MESSAGES,
    dueMessages,
    fillMessage,
    normaliseGuestMessages,
    phoneChannel,
    realEmail,
    smsInfo,
  } = await import("@/lib/guest-messages");
  const on = normaliseGuestMessages({
    welcome: { on: true, time: "12:00" },
    goodbye: { on: true, time: "08:00" },
  });
  const stay = {
    id: "b1",
    status: "upcoming",
    guest_full_name: "Cheryl Aldridge",
    check_in_date: "2026-11-01",
    check_out_date: "2026-11-03",
    welcome_message_at: null,
    goodbye_message_at: null,
  };

  it("starts off, and keeps only sensible choices", () => {
    expect(normaliseGuestMessages(null)).toEqual(DEFAULT_GUEST_MESSAGES);
    const n = normaliseGuestMessages({
      welcome: { on: true, time: "25:00", text: " " },
      phone: "fax",
    });
    expect(n.welcome).toEqual({ ...DEFAULT_GUEST_MESSAGES.welcome, on: true });
    expect(n.phone).toBe("auto");
  });

  it("is due once, on the day, from its time", () => {
    expect(dueMessages(on, stay, { date: "2026-11-01", time: "11:59" })).toEqual([]);
    expect(dueMessages(on, stay, { date: "2026-11-01", time: "12:00" })).toEqual(["welcome"]);
    expect(
      dueMessages(on, { ...stay, welcome_message_at: "x" }, { date: "2026-11-01", time: "13:00" }),
    ).toEqual([]);
    // Never late: the day after, nothing.
    expect(dueMessages(on, stay, { date: "2026-11-02", time: "13:00" })).toEqual([]);
    expect(
      dueMessages(on, { ...stay, status: "checked_out" }, { date: "2026-11-03", time: "09:00" }),
    ).toEqual(["goodbye"]);
    // Cancelled, closed or nameless stays get nothing.
    expect(
      dueMessages(on, { ...stay, status: "cancelled" }, { date: "2026-11-01", time: "13:00" }),
    ).toEqual([]);
    expect(
      dueMessages(on, { ...stay, guest_full_name: " " }, { date: "2026-11-01", time: "13:00" }),
    ).toEqual([]);
  });

  it("fills in the guest's details and tidies what's missing", () => {
    expect(
      fillMessage("Hi {name}, welcome to {property}!", { name: "Alex", property: "Hill" }),
    ).toBe("Hi Alex, welcome to Hill!");
    expect(fillMessage("Hi {name}, room {room}. {nope}", { name: "Alex" })).toBe("Hi Alex, room.");
  });

  it("counts a text as the phone company bills it", () => {
    expect(smsInfo("a".repeat(160))).toEqual({ chars: 160, parts: 1, unicode: false });
    expect(smsInfo("a".repeat(161)).parts).toBe(2);
    expect(smsInfo("Hi 👋").unicode).toBe(true);
    expect(smsInfo("’".repeat(71)).parts).toBe(2);
    expect(smsInfo("€").chars).toBe(2);
  });

  it("uses only guests' own email addresses", () => {
    expect(realEmail("alex@example.com")).toBe(true);
    expect(realEmail("abc123.def@guest.booking.com")).toBe(false);
    expect(realEmail("x@m.guest.booking.com")).toBe(false);
    expect(realEmail("not an email")).toBe(false);
  });

  it("picks WhatsApp when it's set up, else a text, as the host chose", () => {
    expect(phoneChannel("auto", { sms: true, whatsapp: true })).toBe("whatsapp");
    expect(phoneChannel("auto", { sms: true, whatsapp: false })).toBe("sms");
    expect(phoneChannel("whatsapp", { sms: true, whatsapp: false })).toBeNull();
    expect(phoneChannel("none", { sms: true, whatsapp: true })).toBeNull();
  });
});
