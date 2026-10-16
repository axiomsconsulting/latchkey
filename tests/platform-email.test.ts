import { describe, expect, it } from "vitest";

import { guestNameFrom, hostCode, matchStay, messageBody, parseInbound, platformOf, reservationCodeFrom } from "../src/lib/platform-email";

describe("which business a forwarded email is for", () => {
  it("reads the code from the plus part, the whole local part, or Postmark's hash", () => {
    expect(hostCode({ to: ["abc123+k7m2p9q4ab@inbound.postmarkapp.com"] })).toBe("k7m2p9q4ab");
    expect(hostCode({ to: ["Latchkey <k7m2p9q4ab@in.example.com>"] })).toBe("k7m2p9q4ab");
    expect(hostCode({ to: ["x@inbound.postmarkapp.com"], mailboxHash: "k7m2p9q4ab" })).toBe("k7m2p9q4ab");
    expect(hostCode({ to: ["hi@example.com"] })).toBeNull();
  });
});

describe("reading booking-site emails", () => {
  it("knows the platform from the sender or the reply address", () => {
    expect(platformOf("Airbnb <express@airbnb.com>", null, "")).toBe("airbnb");
    expect(platformOf("noreply@booking.com", "abc@guest.booking.com", "")).toBe("booking_com");
    expect(platformOf("host@gmail.com", null, "From: Airbnb <automated@airbnb.com>")).toBe("airbnb");
    expect(platformOf("someone@example.com", null, "")).toBe("other");
  });

  it("finds the guest and the reservation", () => {
    expect(guestNameFrom("RE: Reservation confirmed - Jane Brown arrives Oct 18", "")).toBe("Jane Brown");
    expect(guestNameFrom("Message from guest Sam Lee - booking 4012345678", "")).toBe("Sam Lee");
    expect(guestNameFrom("Fwd: Priya sent you a message", "")).toBe("Priya");
    expect(guestNameFrom("Your booking", "Guest name: Tom Baker\nCheck-in: 20 Oct")).toBe("Tom Baker");
    expect(reservationCodeFrom("airbnb", "Reservation HMABCD1234", "")).toBe("HMABCD1234");
    expect(reservationCodeFrom("booking_com", "New message", "Booking number: 4012345678")).toBe("4012345678");
  });

  it("keeps only the guest's words", () => {
    const text = "Hi! Could we check in at 2pm?\nThanks, Jane\n\nReply\n\nAirbnb, Inc. 888 Brannan St\nUnsubscribe";
    expect(messageBody(text)).toBe("Hi! Could we check in at 2pm?\nThanks, Jane");
    expect(messageBody("Yes please\n\nOn Tue, 14 Oct 2026 at 10:00, Host <h@x.com> wrote:\n> earlier")).toBe("Yes please");
    expect(messageBody("Sounds good\n> quoted line\nsee you")).toBe("Sounds good\nsee you");
  });

  it("parses a guest message with its reply address", () => {
    const p = parseInbound({
      to: ["abc+k7m2p9q4ab@inbound.postmarkapp.com"],
      from: "Airbnb <express@airbnb.com>",
      replyTo: "4f9c2-guest@reply.airbnb.com",
      subject: "RE: Reservation at The Hill Suites for 18 – 20 Oct",
      text: "Jane Brown sent you a message\n\nWhat's the wifi?\n\nReply\n\nReservation HMABCD1234",
    });
    expect(p).toMatchObject({ kind: "message", platform: "airbnb", reservationCode: "HMABCD1234", replyTo: "4f9c2-guest@reply.airbnb.com" });
  });

  it("spots Gmail's forwarding confirmation so the host can finish set-up", () => {
    const p = parseInbound({
      to: ["abc+k7m2p9q4ab@inbound.postmarkapp.com"],
      from: "Gmail Team <forwarding-noreply@google.com>",
      replyTo: null,
      subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from host@gmail.com",
      text: "Confirmation code: 123456789\nTo allow, click https://mail-settings.google.com/mail/vf-abc123 here",
    });
    expect(p).toEqual({ kind: "forward_confirm", provider: "gmail", code: "123456789", link: "https://mail-settings.google.com/mail/vf-abc123" });
  });
});

describe("matching a message to a stay", () => {
  const stay = (id: string, name: string | null, code: string | null, inD = "2026-10-18", channel = "airbnb") => ({
    id, channel, reservation_code: code, guest_full_name: name, check_in_date: inD, check_out_date: "2026-10-20",
  });
  const T = "2026-10-16";
  it("uses the reservation code first, then a clear name match on that platform", () => {
    const stays = [stay("a", "Jane Brown", "HMABCD1234"), stay("b", "Sam Lee", null), stay("c", "Sam Patel", null, "2026-10-19", "booking_com")];
    expect(matchStay({ platform: "airbnb", reservationCode: "HMABCD1234", guestName: null }, stays, T)?.id).toBe("a");
    expect(matchStay({ platform: "airbnb", reservationCode: null, guestName: "Sam" }, stays, T)?.id).toBe("b");
  });
  it("refuses to guess between two guests with the same first name", () => {
    const stays = [stay("b", "Sam Lee", null), stay("d", "Sam Jones", null, "2026-10-21")];
    expect(matchStay({ platform: "airbnb", reservationCode: null, guestName: "Sam" }, stays, T)).toBeNull();
  });
});
