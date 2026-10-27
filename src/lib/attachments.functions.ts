/**
 * Hosts attach photos and documents to guide sections; the super admin
 * connects the Google Drive they're kept in. See drive.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_ATTACHMENT_BYTES, MAX_PER_SECTION, displayName, kindFor } from "@/lib/attachments";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { hostOfProperty, requireWrite } from "@/lib/roles";

const uuid = z.string().uuid();
const sectionKey = z.string().regex(/^(custom_[a-z0-9]{6,20}|[a-z_]{2,30})$/);
type Loose = { from: (t: string) => any; rpc: (fn: string) => any };

async function admin(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

/** For the guide editor: whether attachments can be used, and each section's attachments. */
export const getGuideAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, await hostOfProperty(context.supabase, data.propertyId));
    const { driveConnection, driveConfigured } = await import("./drive.server");
    const ready = driveConfigured() && !!(await driveConnection().catch(() => null));
    const { attachmentsFor } = await import("./attachments.server");
    return { ready, bySection: ready ? await attachmentsFor(data.propertyId) : {} };
  });

/** Uploads one file (sent as base64) to the host's own folder, named after the section. */
export const uploadGuideAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        propertyId: uuid,
        sectionKey,
        name: z.string().trim().min(1).max(200),
        mime: z.string().max(120),
        data: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 16),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const hostId = await hostOfProperty(context.supabase, data.propertyId);
    await requireWrite(context.supabase, hostId);
    const kind = kindFor(data.mime);
    if (!kind) throw new Error("Attach photos (JPG, PNG, WebP, GIF), PDFs, or Word, Excel or PowerPoint files.");
    const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error("That file is over 10 MB. Try a smaller one.");
    const sb = await admin();
    const { count } = await sb.from("guide_attachments").select("id", { count: "exact", head: true }).eq("property_id", data.propertyId).eq("section_key", data.sectionKey);
    if ((count ?? 0) >= MAX_PER_SECTION) throw new Error(`A section can have up to ${MAX_PER_SECTION} attachments.`);
    const { data: host } = await sb.from("hosts").select("business_name").eq("id", hostId).maybeSingle();
    const { hostFolder, uploadAttachment } = await import("./drive.server");
    const folderId = await hostFolder(hostId, host?.business_name ?? "Host");
    const id = crypto.randomUUID();
    const fileId = await uploadAttachment({ folderId, sectionKey: data.sectionKey, id, originalName: data.name, mime: data.mime, bytes });
    const { error } = await sb.from("guide_attachments").insert({
      id,
      host_id: hostId,
      property_id: data.propertyId,
      section_key: data.sectionKey,
      file_id: fileId,
      name: displayName(data.name),
      mime: data.mime,
      kind,
      size_bytes: bytes.length,
      position: count ?? 0,
    });
    if (error) {
      const { deleteFiles } = await import("./drive.server");
      await deleteFiles([fileId]);
      throw new Error(error.message);
    }
    return { id };
  });

export const deleteGuideAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: row } = await sb.from("guide_attachments").select("id, file_id, host_id").eq("id", data.id).maybeSingle();
    if (!row) return { ok: true };
    await requireWrite(context.supabase, row.host_id);
    const { deleteFiles } = await import("./drive.server");
    await deleteFiles([row.file_id]);
    await sb.from("guide_attachments").delete().eq("id", row.id);
    return { ok: true };
  });

export const renameGuideAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, name: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: row } = await sb.from("guide_attachments").select("host_id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Not available.");
    await requireWrite(context.supabase, row.host_id);
    await sb.from("guide_attachments").update({ name: data.name }).eq("id", data.id);
    return { ok: true };
  });

/* ------------------------------ super admin ------------------------------ */

async function requireSuperAdmin(supabase: unknown) {
  const { data } = await (supabase as Loose).rpc("is_super_admin");
  if (data !== true) throw new Error("Super admin only.");
}

function callbackUrl(): string {
  const req = getRequest();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}/api/public/google/callback`;
}

export const driveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { driveConfigured, driveConnection } = await import("./drive.server");
    const c = await driveConnection().catch(() => null);
    const { driveQueueStatus } = await import("./private-store.server");
    const queue = await driveQueueStatus().catch(() => null);
    return { configured: driveConfigured(), connected: !!c, email: c?.email ?? null, connectedAt: c?.connectedAt ?? null, callback: callbackUrl(), queue };
  });

/** Moves private files waiting for Google Drive now (the daily clean-up does it too). */
export const syncPrivateQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { syncDriveQueue } = await import("./private-store.server");
    return syncDriveQueue(100);
  });

/** Where to send the super admin to connect their Google account. */
export const driveConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { consentUrl, driveConfigured, newOAuthState } = await import("./drive.server");
    if (!driveConfigured()) throw new Error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Lovable Cloud first.");
    return { url: consentUrl(callbackUrl(), await newOAuthState()) };
  });

export const driveDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context.supabase);
    const { disconnect } = await import("./drive.server");
    await disconnect();
    return { ok: true };
  });
