/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Server only: guide attachments for guests and hosts, with signed links
 * that last a few hours. Files live in the host's own Drive folder
 * (drive.server.ts); rules in attachments.ts.
 */
import { signAttachment, type AttachmentKind } from "./attachments";

type Loose = { from: (t: string) => any };
async function db(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export function signingSecret(): string {
  const s = (
    process.env["ATTACHMENT_SIGNING_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    ""
  ).trim();
  if (!s) throw new Error("Attachments aren't set up yet.");
  return s;
}

export type GuestAttachment = { id: string; name: string; kind: AttachmentKind; url: string };

/** A property's attachments, by section, each with a link that works for six hours. */
export async function attachmentsFor(
  propertyId: string,
): Promise<Record<string, GuestAttachment[]>> {
  let rows: Array<{ id: string; section_key: string; name: string; kind: AttachmentKind }> = [];
  try {
    const { data, error } = await (
      await db()
    )
      .from("guide_attachments")
      .select("id, section_key, name, kind")
      .eq("property_id", propertyId)
      .order("position")
      .order("created_at");
    if (error) return {};
    rows = data ?? [];
  } catch {
    return {};
  }
  if (!rows.length) return {};
  const secret = signingSecret();
  const expires = Math.floor(Date.now() / 1000) + 6 * 3600;
  const out: Record<string, GuestAttachment[]> = {};
  for (const r of rows) {
    (out[r.section_key] ??= []).push({
      id: r.id,
      name: r.name,
      kind: r.kind,
      url: await signAttachment(secret, r.id, expires),
    });
  }
  return out;
}

/** Removes a section's attachments (all of them, or for every section when none is named) from the store and the list. */
export async function deleteAttachments(propertyId: string, sectionKey?: string) {
  const sb = await db();
  let q = sb.from("guide_attachments").select("id, file_id").eq("property_id", propertyId);
  if (sectionKey) q = q.eq("section_key", sectionKey);
  const { data, error } = await q;
  if (error || !data?.length) return;
  const { deleteFiles } = await import("./drive.server");
  await deleteFiles((data as Array<{ file_id: string }>).map((r) => r.file_id));
  await sb
    .from("guide_attachments")
    .delete()
    .in(
      "id",
      (data as Array<{ id: string }>).map((r) => r.id),
    );
}
