/**
 * Photos on a phone for a check-in at the door tablet (rules in
 * src/lib/photo-handoff.ts). The kiosk starts a link, sets each photo task
 * and reads the answer; the phone opens the link, takes the ID (camera or a
 * saved photo) and then the face photo (live only). The phone calls the
 * same checks as the kiosk's own camera (findByPhotoId, verifyPhotoId,
 * checkCompanionId, addFacePhoto), allowed only for the task on screen now.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  HANDOFF_MINUTES,
  PHOTO_KINDS,
  faceNext,
  idAnswerFinal,
  nextTask,
  photoLinkText,
  plausibleMobile,
  resultFor,
  type JsonObject,
  type PhotoResult,
  type PhotoTask,
} from "./photo-handoff";

const secret = z.string().min(20).max(80);
const image = z
  .string()
  .max(6_000_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,/);
const small = z
  .string()
  .max(560_000)
  .regex(/^data:image\/jpeg;base64,/);

const srv = () => import("./photo-handoff.server");

/** A random secret for one side of the link. */
function newSecret(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const hex32 = () =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** The kiosk starts the phone link for this check-in (made once, at its first photo step). */
export const startPhotoHandoff = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(2).max(60), deviceId: z.string().min(8).max(80) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { loadPropertyByCode } = await import("./checkin.server");
    const { db, hashFor, seal } = await srv();
    const p = await loadPropertyByCode(data.code);
    if (!p) throw new Error("We could not find this property.");
    const rows = await db();
    // A busy door makes a few an hour; more than this is someone tapping around.
    const { count } = await rows
      .from("photo_handoffs")
      .select("id", { count: "exact", head: true })
      .eq("property_id", p.id)
      .gt("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) > 60) throw new Error("Please use this screen's camera for now.");
    const kiosk = newSecret();
    const phone = newSecret();
    const channel = hex32();
    const expiresAt = new Date(Date.now() + HANDOFF_MINUTES * 60_000).toISOString();
    const { error } = await rows.from("photo_handoffs").insert({
      property_id: p.id,
      kiosk_hash: await hashFor(kiosk),
      phone_hash: await hashFor(phone),
      phone_sealed: await seal(phone),
      channel,
      device_id: data.deviceId,
      expires_at: expiresAt,
    });
    if (error)
      throw new Error("Taking photos on a phone needs the latest update (migration 0079).");
    const { guestChannels } = await import("./guest-messaging.server");
    const ch = await guestChannels(p.host_id as string).catch(() => null);
    const { publicOrigin } = await import("./integrations.server");
    return {
      key: kiosk,
      channel,
      phoneUrl: `${publicOrigin()}/photos/${phone}`,
      expiresAt,
      // "Text me the link" only where it would really go (or, in demo, to show how it works).
      send: { sms: !!ch?.sms, whatsapp: !!ch?.whatsapp && !!ch.whatsappTemplates.photo_link },
    };
  });

/** The kiosk's next photo step: the phone shows it at once. */
export const setPhotoTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        key: secret,
        token: z.string().min(20).max(80).optional(),
        kind: z.enum(PHOTO_KINDS as [PhotoTask["kind"], ...PhotoTask["kind"][]]),
        position: z.number().int().min(0).max(29),
        face: z.boolean(),
        /** The host keeps a small copy of the ID (the kiosk sends it only then). */
        keep: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadKioskHandoff, db, pingHandoff } = await srv();
    const row = await loadKioskHandoff(data.key);
    if (!row) throw new Error("This link has timed out.");
    let sessionId = row.session_id;
    if (data.token) {
      const { loadSession } = await import("./checkin.server");
      const s = await loadSession(data.token);
      if (s.property_id !== row.property_id) throw new Error("Not available.");
      sessionId = s.id;
    }
    if (data.kind !== "find" && !sessionId) throw new Error("Not available.");
    const task = { ...nextTask(row.task, data), keep: data.keep };
    await (
      await db()
    )
      .from("photo_handoffs")
      .update({ task, result: null, session_id: sessionId })
      .eq("id", row.id);
    await pingHandoff(row.channel);
    return { task: task as PhotoTask };
  });

/** The guest used the tablet's own camera (or moved on): the phone stops showing the task. */
export const clearPhotoTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: secret, end: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { loadKioskHandoff, db, pingHandoff } = await srv();
    const row = await loadKioskHandoff(data.key);
    if (!row) return { ok: true };
    await (
      await db()
    )
      .from("photo_handoffs")
      .update(
        data.end
          ? { task: null, expires_at: new Date().toISOString() }
          : { task: null, result: null },
      )
      .eq("id", row.id);
    await pingHandoff(row.channel);
    return { ok: true };
  });

/** What the kiosk needs: is a phone on the link, and the answer to the task it's waiting on. */
export const photoHandoffState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: secret }).parse(d))
  .handler(async ({ data }) => {
    const { loadKioskHandoff, unseal } = await srv();
    const row = await loadKioskHandoff(data.key);
    if (!row) return { open: false as const };
    let result: PhotoResult | null = row.task ? resultFor(row.result, row.task.n) : null;
    // A stay found from the ID: its check-in token, sealed until now.
    const sealed = result?.id?.["sealed"];
    if (result?.id && typeof sealed === "string") {
      const { sealed: _s, ...id } = result.id;
      result = { ...result, id: { ...id, token: await unseal(sealed) } };
    }
    return {
      open: true as const,
      opened: !!row.opened_at,
      phoneSeenAt: row.phone_seen_at,
      task: row.task,
      result,
    };
  });

/** "Text me the link": to the guest's mobile, by text or WhatsApp. */
export const sendPhotoLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ key: secret, phone: z.string().min(8).max(20), via: z.enum(["sms", "whatsapp"]) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { loadKioskHandoff, db } = await srv();
    const row = await loadKioskHandoff(data.key);
    if (!row) throw new Error("This link has timed out.");
    const { checkPhone } = await import("./world");
    const checked = checkPhone(data.phone, "GB");
    const to = checked.ok ? checked.e164 : null;
    if (!to || !plausibleMobile(to)) return { status: "bad_number" as const };
    const { data: p } = await (
      await db()
    )
      .from("properties")
      .select("host_id, name")
      .eq("id", row.property_id)
      .single();
    // Not stored: the number is used for this one message.
    const { sendGuestText } = await import("./guest-messaging.server");
    const { publicOrigin } = await import("./integrations.server");
    // The same link as the square (sealed in the row), so a phone that scanned it keeps working.
    const { unseal } = await srv();
    const phone = row.phone_sealed ? await unseal(row.phone_sealed) : null;
    if (!phone) throw new Error("This link has timed out.");
    const url = `${publicOrigin()}/photos/${phone}`;
    const status = await sendGuestText({
      hostId: p.host_id,
      to,
      channel: data.via,
      body: photoLinkText(p.name, url),
      template: { key: "photo_link", vars: [p.name, url] },
    });
    return { status, phoneUrl: url };
  });

/* ------------------------------- the phone ------------------------------- */

async function phoneRow(token: string) {
  const { loadPhoneHandoff } = await srv();
  return loadPhoneHandoff(token);
}

/** The phone opens the link (and checks back every few seconds): the property's look and the task now. */
export const openPhotoHandoff = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: secret }).parse(d))
  .handler(async ({ data }) => {
    const row = await phoneRow(data.token);
    if (!row) return { open: false as const };
    const { db, pingHandoff } = await srv();
    const now = new Date().toISOString();
    await (
      await db()
    )
      .from("photo_handoffs")
      .update({ phone_seen_at: now, ...(row.opened_at ? {} : { opened_at: now }) })
      .eq("id", row.id);
    // The tablet moves on to "carry on on your phone" as soon as the link opens.
    if (!row.opened_at) await pingHandoff(row.channel);
    const { data: p } = await (
      await db()
    )
      .from("properties")
      .select("name, short_code, theme_config, host_id")
      .eq("id", row.property_id)
      .single();
    const { normaliseTheme } = await import("./theme");
    const { withGroup } = await import("./group-brand.server");
    const result = row.task ? resultFor(row.result, row.task.n) : null;
    return {
      open: true as const,
      channel: row.channel,
      property: {
        name: p.name as string,
        code: p.short_code as string,
        theme: await withGroup(normaliseTheme(p.theme_config), p.host_id, p.name),
      },
      task: row.task,
      // Only what the phone shows: how the ID went, never the stay's token.
      result: result
        ? {
            n: result.n,
            face: result.face ?? null,
            id: result.id ? { status: String(result.id["status"] ?? "") } : null,
          }
        : null,
    };
  });

/** The ID from the phone: the same check as the kiosk's camera, its answer kept for the kiosk. */
export const phonePhotoId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ token: secret, n: z.number().int().min(1), image, small: small.optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const row = await phoneRow(data.token);
    const task = row?.task as (PhotoTask & { keep?: boolean }) | null | undefined;
    if (!row || !task || task.n !== data.n || task.kind === "face")
      return { status: "moved" as const };
    if (resultFor(row.result, task.n)?.id) return { status: "moved" as const };
    const tries = task.tries + 1;
    const keepSmall = task.keep && data.small ? { small: data.small } : {};
    let id: JsonObject;
    if (task.kind === "find") {
      const { findByPhotoId } = await import("./checkin.functions");
      const { db } = await srv();
      const { data: p } = await (
        await db()
      )
        .from("properties")
        .select("short_code")
        .eq("id", row.property_id)
        .single();
      id = (await findByPhotoId({
        data: {
          code: p.short_code,
          deviceId: row.device_id,
          image: data.image,
          ...(data.small ? { small: data.small } : {}),
        },
      })) as unknown as JsonObject;
    } else if (task.kind === "lead") {
      const { verifyPhotoId } = await import("./checkin.functions");
      id = (await verifyPhotoId({
        data: { token: data.token, image: data.image, ...keepSmall },
      })) as unknown as JsonObject;
    } else {
      const { checkCompanionId } = await import("./checkin.functions");
      id = (await checkCompanionId({
        data: {
          token: data.token,
          position: task.position,
          image: data.image,
          ...keepSmall,
          ...(tries > 1 ? { again: true } : {}),
        },
      })) as unknown as JsonObject;
    }
    const status = String(id["status"] ?? "");
    const { db, pingHandoff, seal } = await srv();
    const rows = await db();
    if (!idAnswerFinal(task.kind, status, tries)) {
      await rows
        .from("photo_handoffs")
        .update({ task: { ...task, tries } })
        .eq("id", row.id);
      return {
        status: "retry" as const,
        reason: (id["reason"] as string | undefined) ?? null,
        left: (id["left"] as number | undefined) ?? null,
      };
    }
    // A second unreadable photo while finding the stay: found the usual way instead.
    if (status === "retry") id = { status: "find" };
    let sessionId = row.session_id;
    if (task.kind === "find" && status === "matched" && typeof id["token"] === "string") {
      const { loadSession } = await import("./checkin.server");
      sessionId = (await loadSession(String(id["token"]))).id;
      const { token: plain, ...rest } = id;
      id = { ...rest, sealed: await seal(String(plain)) };
    }
    const result: PhotoResult = { n: task.n, id, face: null };
    await rows
      .from("photo_handoffs")
      .update({ result, session_id: sessionId, task: { ...task, tries } })
      .eq("id", row.id);
    await pingHandoff(row.channel);
    return { status: "sent" as const, face: faceNext(task, status), idStatus: status };
  });

/** The face photo from the phone (live camera only), or the guest skipped it. */
export const phoneFacePhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: secret, n: z.number().int().min(1), image: small.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const row = await phoneRow(data.token);
    const task = row?.task;
    if (!row || !task || task.n !== data.n) return { status: "moved" as const };
    const prior = resultFor(row.result, task.n);
    if (task.kind !== "face" && !(prior?.id && faceNext(task, String(prior.id["status"] ?? ""))))
      return { status: "moved" as const };
    if (prior?.face) return { status: "sent" as const };
    if (data.image) {
      const { addFacePhoto } = await import("./checkin.functions");
      await addFacePhoto({
        data: { token: data.token, position: task.position, image: data.image },
      });
    }
    const { db, pingHandoff } = await srv();
    const result: PhotoResult = {
      n: task.n,
      id: prior?.id ?? null,
      face: data.image ? "taken" : "skipped",
    };
    await (await db()).from("photo_handoffs").update({ result }).eq("id", row.id);
    await pingHandoff(row.channel);
    return { status: "sent" as const };
  });
