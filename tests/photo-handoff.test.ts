import { describe, expect, it } from "vitest";

import {
  faceNext,
  idAnswerFinal,
  kioskHandoff,
  nextTask,
  phoneConnected,
  phoneScreen,
  photoLinkText,
  plausibleMobile,
  resultFor,
} from "@/lib/photo-handoff";

describe("photos on a phone for the door tablet", () => {
  it("numbers every task, so a late answer to the last one is never taken", () => {
    const a = nextTask(null, { kind: "find", position: 3, face: true });
    expect(a).toEqual({ n: 1, kind: "find", position: 0, face: true, tries: 0 });
    const b = nextTask(a, { kind: "companion", position: 2, face: true });
    expect(b.n).toBe(2);
    expect(b.position).toBe(2);
    // A face task never asks for another face after it.
    expect(nextTask(b, { kind: "face", position: 1, face: true }).face).toBe(false);
    expect(resultFor({ n: 1, id: { status: "done" } }, 2)).toBeNull();
    expect(resultFor({ n: 2, id: { status: "done" } }, 2)?.n).toBe(2);
    expect(resultFor(null, 1)).toBeNull();
  });

  it("keeps retries on the phone, and hands the tablet only final answers", () => {
    expect(idAnswerFinal("lead", "retry", 1)).toBe(false);
    expect(idAnswerFinal("lead", "done", 1)).toBe(true);
    expect(idAnswerFinal("lead", "fallback", 3)).toBe(true);
    expect(idAnswerFinal("companion", "skip", 1)).toBe(true);
    // Finding the stay: one more try, then the usual questions on the tablet.
    expect(idAnswerFinal("find", "retry", 1)).toBe(false);
    expect(idAnswerFinal("find", "retry", 2)).toBe(true);
    expect(idAnswerFinal("find", "find", 1)).toBe(true);
  });

  it("goes on to the selfie only when asked and the ID went through", () => {
    expect(faceNext({ kind: "lead", face: true }, "done")).toBe(true);
    expect(faceNext({ kind: "lead", face: true }, "fallback")).toBe(false);
    expect(faceNext({ kind: "lead", face: false }, "done")).toBe(false);
    expect(faceNext({ kind: "find", face: true }, "matched")).toBe(true);
    expect(faceNext({ kind: "find", face: true }, "find")).toBe(false);
  });

  it("shows the phone exactly what the tablet needs now", () => {
    const lead = nextTask(null, { kind: "lead", position: 0, face: true });
    expect(phoneScreen(null, null, false)).toBe("closed");
    expect(phoneScreen(null, null, true)).toBe("wait");
    expect(phoneScreen(lead, null, true)).toBe("id");
    expect(phoneScreen(lead, { n: lead.n, id: { status: "done" } }, true)).toBe("face");
    expect(phoneScreen(lead, { n: lead.n, id: { status: "done" }, face: "taken" }, true)).toBe(
      "sent",
    );
    expect(phoneScreen(lead, { n: lead.n, id: { status: "fallback" } }, true)).toBe("sent");
    // An answer to an older task doesn't count for this one.
    expect(phoneScreen(lead, { n: lead.n - 1, id: { status: "done" } }, true)).toBe("id");
    const face = nextTask(lead, { kind: "face", position: 1, face: false });
    expect(phoneScreen(face, null, true)).toBe("face");
    expect(phoneScreen(face, { n: face.n, face: "skipped" }, true)).toBe("sent");
  });

  it("tells the tablet to wait only while a phone is really on the task", () => {
    const t = nextTask(null, { kind: "lead", position: 0, face: false });
    expect(kioskHandoff({ connected: false, task: t, result: null })).toBe("offer");
    expect(kioskHandoff({ connected: true, task: null, result: null })).toBe("offer");
    expect(kioskHandoff({ connected: true, task: t, result: null })).toBe("onPhone");
    expect(kioskHandoff({ connected: true, task: t, result: { n: t.n, id: {} } })).toBe("offer");
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(phoneConnected("2026-11-01T11:59:50Z", now)).toBe(true);
    expect(phoneConnected("2026-11-01T11:59:00Z", now)).toBe(false);
    expect(phoneConnected(null, now)).toBe(false);
  });

  it("fits the link in one text and only texts mobile numbers", () => {
    const text = photoLinkText(
      "The Trinity Suites",
      "https://latchkey.omsestates.uk/photos/abcdefghijklmnopqrstuvwxyz012345",
    );
    expect(text.length).toBeLessThanOrEqual(160);
    expect(photoLinkText("x".repeat(80), "u")).toContain("…");
    expect(plausibleMobile("+447700900123")).toBe(true);
    expect(plausibleMobile("07700900123")).toBe(false);
  });
});

describe("the found stay's check-in token, sealed until the tablet collects it", () => {
  it("opens only with the server's secret and never as plain text", async () => {
    process.env["PRIVATE_FILE_SIGNING_SECRET"] = "test-secret-for-sealing-only";
    const { seal, unseal } = await import("@/lib/photo-handoff.server");
    const sealed = await seal("token-abc-123");
    expect(sealed).not.toContain("token-abc-123");
    expect(await unseal(sealed)).toBe("token-abc-123");
    expect(await unseal(sealed.replace(/.$/, sealed.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await unseal("nonsense")).toBeNull();
  });
});
