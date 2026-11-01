/**
 * Server only: private files in Google Drive, with a queue for when Drive
 * can't be reached (rules and references in private-store.ts).
 *
 * storePrivate() uploads straight to the right restricted folder and checks
 * Drive's SHA-256 matches. If Drive is unreachable it keeps the file in the
 * private "private-queue" bucket and records it in drive_queue;
 * syncDriveQueue() later moves it, confirms the copy, points the record at
 * Drive and only then deletes the queued copy and the queue row. Deleting
 * (retention) removes the Drive file permanently, not to the bin.
 */
import {
  REF_COLUMNS,
  ROOT_FOLDER_NAME,
  STORE_GROUPS,
  driveRef,
  ownerFolderName,
  queueRef,
  readRef,
  refAllowed,
  safePart,
  sha256OfBytes,
  signPrivateLink,
  type StoreKind,
} from "./private-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the 0062 tables and storage aren't in the generated types
type Loose = { from: (t: string) => any; storage: any };
async function sb(): Promise<Loose> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export const QUEUE_BUCKET = "private-queue";
const LEGACY_GUEST_BUCKET = "guest-ids";
let queueReady = false;

async function ensureQueueBucket() {
  if (queueReady) return;
  const db = await sb();
  const { data } = await db.storage.getBucket(QUEUE_BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(QUEUE_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  }
  queueReady = true;
}

export function signingSecret(): string {
  const s = (
    process.env["PRIVATE_FILE_SIGNING_SECRET"] ??
    process.env["ATTACHMENT_SIGNING_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    ""
  ).trim();
  if (!s) throw new Error("Private files aren't set up yet.");
  return s;
}

/** Whether a Google Drive account is connected (Latchkey admin → Integrations). */
export async function driveReady(): Promise<boolean> {
  try {
    const { driveConfigured, driveConnection } = await import("./drive.server");
    return driveConfigured() && !!(await driveConnection());
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- folders */

async function folder(key: string, name: string, parent: string | null): Promise<string> {
  const db = await sb();
  const { data } = await db.from("drive_folders").select("folder_id").eq("key", key).maybeSingle();
  if (data?.folder_id) return data.folder_id as string;
  const { createFolder } = await import("./drive.server");
  const id = await createFolder(name, parent);
  const { error } = await db.from("drive_folders").insert({ key, folder_id: id });
  if (error) {
    // Made at the same moment by another request: use theirs, drop ours.
    const { data: again } = await db
      .from("drive_folders")
      .select("folder_id")
      .eq("key", key)
      .maybeSingle();
    if (again?.folder_id) {
      const { deleteFiles } = await import("./drive.server");
      await deleteFiles([id]);
      return again.folder_id as string;
    }
    throw new Error(error.message);
  }
  return id;
}

/** Root → group (guest IDs, partner IDs, partner agreements) → one folder per business or partner. */
async function folderFor(kind: StoreKind, ownerKey: string, ownerLabel: string): Promise<string> {
  const g = STORE_GROUPS[kind];
  const root = await folder("root", ROOT_FOLDER_NAME, null);
  const group = await folder(`group:${g.key}`, g.name, root);
  return folder(`${g.key}:${ownerKey}`, ownerFolderName(ownerKey, ownerLabel), group);
}

/* --------------------------------------------------------------- upload */

async function uploadToDrive(
  folderId: string,
  name: string,
  mime: string,
  bytes: Uint8Array,
  sha: string,
): Promise<string> {
  const { drive, deleteFiles } = await import("./drive.server");
  const boundary = `lk${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = { name, parents: [folderId], appProperties: { latchkey: "private" } };
  const head = new TextEncoder().encode(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const res = await drive(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,size,sha256Checksum",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    size?: string;
    sha256Checksum?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id)
    throw new Error(json.error?.message ?? `Google Drive refused the upload (${res.status}).`);
  // Confirm Drive holds an exact copy before anything else is deleted.
  const same = json.sha256Checksum
    ? json.sha256Checksum.toLowerCase() === sha
    : Number(json.size) === bytes.length;
  if (!same) {
    await deleteFiles([json.id]);
    throw new Error("Google Drive's copy didn't match: kept in the queue to try again.");
  }
  return json.id;
}

export type StoreInput = {
  kind: StoreKind;
  /** Business id (guests) or partner id: one folder each. */
  ownerKey: string;
  ownerLabel: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  /** The column that will hold the returned reference (the queue updates it once moved). */
  ref: { table: string; column: string };
  /**
   * Someone is waiting (a guest at check-in): keep it in the queue now, a
   * quick write, and let the next move take it to Drive. Links keep working
   * across the move (resolveRef).
   */
  soon?: boolean;
};

/** Stores a private file in Drive, or queues it if Drive can't be reached. Returns the reference to save. */
export async function storePrivate(o: StoreInput): Promise<string> {
  if (!refAllowed(o.ref.table, o.ref.column))
    throw new Error(`Not a private file column: ${o.ref.table}.${o.ref.column}`);
  const name = safePart(o.name);
  const sha = await sha256OfBytes(o.bytes);
  let lastError: string | null = null;
  if (o.soon) {
    // Moved to Drive by syncDriveQueue (every calendar sync, about every 30 minutes).
  } else if (await driveReady()) {
    try {
      const id = await uploadToDrive(
        await folderFor(o.kind, o.ownerKey, o.ownerLabel),
        name,
        o.mime,
        o.bytes,
        sha,
      );
      return driveRef(id);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("Drive upload failed; queued instead", lastError);
    }
  } else {
    lastError = "Google Drive isn't connected.";
  }
  await ensureQueueBucket();
  const db = await sb();
  const path = `${o.kind}/${safePart(o.ownerKey)}/${crypto.randomUUID()}-${name}`;
  const up = await db.storage.from(QUEUE_BUCKET).upload(path, o.bytes, { contentType: o.mime });
  if (up.error) throw new Error(up.error.message);
  const { error } = await db.from("drive_queue").insert({
    path,
    kind: o.kind,
    owner_key: o.ownerKey,
    owner_label: o.ownerLabel.slice(0, 120),
    file_name: name,
    mime: o.mime,
    sha256: sha,
    ref_table: o.ref.table,
    ref_column: o.ref.column,
    last_error: lastError,
  });
  if (error) {
    await db.storage.from(QUEUE_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return queueRef(path);
}

/* --------------------------------------------------------- read, delete */

/**
 * Where a file is now: a queued file that has since moved to Drive is
 * followed to its Drive copy (drive_queue.moved_to, kept a day after the
 * move, migration 0078), so a link made before the move still opens it.
 */
export async function resolveRef(ref: string): Promise<string> {
  const r = readRef(ref);
  if (r.where !== "queue") return ref;
  const db = await sb();
  const { data, error } = await db
    .from("drive_queue")
    .select("moved_to")
    .eq("path", r.path)
    .maybeSingle();
  if (error || !data?.moved_to) return ref;
  return data.moved_to as string;
}

/** A stored file's bytes, wherever it is now. */
export async function readPrivate(
  ref: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const r = readRef(await resolveRef(ref));
  if (r.where === "drive") {
    const { drive } = await import("./drive.server");
    const res = await drive(`/drive/v3/files/${encodeURIComponent(r.fileId)}?alt=media`);
    if (!res.ok) return null;
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mime: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
  const db = await sb();
  const bucket = r.where === "queue" ? QUEUE_BUCKET : LEGACY_GUEST_BUCKET;
  const { data, error } = await db.storage.from(bucket).download(r.path);
  if (error || !data) return null;
  return {
    bytes: new Uint8Array(await (data as Blob).arrayBuffer()),
    mime: (data as Blob).type || "image/jpeg",
  };
}

/** Deletes stored files for good (Drive: deleted, not binned; queue: copy and queue row). */
export async function removePrivate(refs: Array<string | null | undefined>): Promise<void> {
  const list = refs.filter((x): x is string => !!x).map(readRef);
  const driveIds = list.flatMap((r) => (r.where === "drive" ? [r.fileId] : []));
  const queued = list.flatMap((r) => (r.where === "queue" ? [r.path] : []));
  const legacy = list.flatMap((r) => (r.where === "legacy" ? [r.path] : []));
  if (driveIds.length) {
    const { deleteFiles } = await import("./drive.server");
    await deleteFiles(driveIds);
  }
  const db = await sb();
  if (queued.length) {
    await db.storage.from(QUEUE_BUCKET).remove(queued);
    await db.from("drive_queue").delete().in("path", queued);
  }
  if (legacy.length) await db.storage.from(LEGACY_GUEST_BUCKET).remove(legacy);
}

/** Links that show each file for `seconds` (10 minutes by default), keyed by reference. */
export async function signPrivateLinks(
  refs: Array<string | null | undefined>,
  seconds = 600,
  name = "photo",
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = refs.filter((x): x is string => !!x);
  if (!list.length) return out;
  const secret = signingSecret();
  const expires = Math.floor(Date.now() / 1000) + seconds;
  for (const ref of list) out[ref] = await signPrivateLink(secret, ref, expires, name);
  return out;
}

/* ---------------------------------------------------------------- queue */

type QueueRow = {
  id: string;
  path: string;
  kind: StoreKind;
  owner_key: string;
  owner_label: string;
  file_name: string;
  mime: string;
  sha256: string;
  ref_table: string;
  ref_column: string;
  attempts: number | null;
};
type GuestPhotoRow = { id: string; booking_id: string; property_id: string } & Record<
  string,
  string | null
>;

export type SyncSummary = { moved: number; failed: number; waiting: number };

/** Points the record at its new home; false if the record has gone meanwhile (e.g. deleted by retention). */
async function repoint(table: string, column: string, from: string, to: string): Promise<boolean> {
  if (!REF_COLUMNS[table]?.includes(column)) return false;
  const db = await sb();
  const { data, error } = await db
    .from(table)
    .update({ [column]: to })
    .eq(column, from)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Moves queued files to Google Drive: upload, confirm the copy, repoint the
 * record, then delete the queued copy. Also moves guest photos saved before
 * Drive was used. Safe to run often; does nothing while Drive is unreachable.
 */
export async function syncDriveQueue(limit = 25): Promise<SyncSummary> {
  const db = await sb();
  const summary: SyncSummary = { moved: 0, failed: 0, waiting: 0 };
  if (!(await driveReady())) {
    summary.waiting = await waitingCount();
    return summary;
  }
  // Two minutes' grace: the record that will point at a new file is saved just after the file.
  const settled = new Date(Date.now() - 120_000).toISOString();
  const { withLegacy } = await import("./checkin.server");
  const { data: rows } = await withLegacy(
    () =>
      db
        .from("drive_queue")
        .select("*")
        .is("moved_to", null)
        .lt("created_at", settled)
        .order("created_at")
        .limit(limit),
    () =>
      db.from("drive_queue").select("*").lt("created_at", settled).order("created_at").limit(limit),
  );
  for (const q of (rows ?? []) as QueueRow[]) {
    try {
      const { data: blob, error } = await db.storage.from(QUEUE_BUCKET).download(q.path);
      if (error || !blob) {
        // The queued copy is gone (deleted by retention): nothing left to move.
        await db.from("drive_queue").delete().eq("id", q.id);
        continue;
      }
      const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
      if ((await sha256OfBytes(bytes)) !== q.sha256)
        throw new Error("The queued copy changed; kept for review.");
      const id = await uploadToDrive(
        await folderFor(q.kind, q.owner_key, q.owner_label),
        q.file_name,
        q.mime,
        bytes,
        q.sha256,
      );
      const kept = await repoint(q.ref_table, q.ref_column, queueRef(q.path), driveRef(id));
      if (!kept) {
        const { deleteFiles } = await import("./drive.server");
        await deleteFiles([id]);
      }
      await db.storage.from(QUEUE_BUCKET).remove([q.path]);
      // Kept a day as a pointer, so links made before the move still open (resolveRef).
      const { error: markErr } = await db
        .from("drive_queue")
        .update({ moved_to: driveRef(id), moved_at: new Date().toISOString() })
        .eq("id", q.id);
      if (markErr) await db.from("drive_queue").delete().eq("id", q.id);
      summary.moved++;
    } catch (e) {
      summary.failed++;
      await db
        .from("drive_queue")
        .update({
          attempts: (q.attempts ?? 0) + 1,
          last_error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", q.id);
    }
  }
  summary.moved += await moveLegacyGuestPhotos(Math.max(0, limit - summary.moved));
  // Pointers to moved files are only needed while links made before the move last (10 minutes).
  await db
    .from("drive_queue")
    .delete()
    .lt("moved_at", new Date(Date.now() - 86_400_000).toISOString());
  summary.waiting = await waitingCount();
  return summary;
}

/** Files still waiting to move (not the pointers left by moved ones). */
async function waitingCount(): Promise<number> {
  const db = await sb();
  const head = () => db.from("drive_queue").select("id", { count: "exact", head: true });
  const res = await head().is("moved_to", null);
  // Before migration 0078 every row is waiting.
  const { count } = res.error ? await head() : res;
  return count ?? 0;
}

/** Quick check before a frequent run: anything waiting at all? */
export async function queueWaiting(): Promise<boolean> {
  return (await waitingCount()) > 0;
}

/** Guest photos saved in the "guest-ids" bucket before Drive: moved across the same way. */
async function moveLegacyGuestPhotos(limit: number): Promise<number> {
  if (limit <= 0) return 0;
  const db = await sb();
  let moved = 0;
  for (const column of ["id_photo_path", "face_photo_path"] as const) {
    const { data } = await db
      .from("guest_ids")
      .select(`id, ${column}, booking_id, property_id`)
      .not(column, "is", null)
      .not(column, "like", "drive:%")
      .not(column, "like", "queue:%")
      .limit(limit);
    for (const row of (data ?? []) as GuestPhotoRow[]) {
      const path = row[column]!;
      try {
        const { data: blob } = await db.storage.from(LEGACY_GUEST_BUCKET).download(path);
        if (!blob) {
          await db
            .from("guest_ids")
            .update({ [column]: null })
            .eq("id", row.id);
          continue;
        }
        const owner = await guestOwner(row.property_id);
        const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
        const id = await uploadToDrive(
          await folderFor(
            column === "id_photo_path" ? "guest_id" : "guest_face",
            owner.key,
            owner.label,
          ),
          safePart(`${row.booking_id}-${column === "id_photo_path" ? "id" : "face"}.jpg`),
          "image/jpeg",
          bytes,
          await sha256OfBytes(bytes),
        );
        if (await repoint("guest_ids", column, path, driveRef(id))) {
          await db.storage.from(LEGACY_GUEST_BUCKET).remove([path]);
          moved++;
        }
      } catch (e) {
        console.error("Moving a guest photo to Drive failed", e instanceof Error ? e.message : e);
      }
    }
  }
  return moved;
}

/** Which business a property belongs to, for the guest photo folder. */
export async function guestOwner(propertyId: string): Promise<{ key: string; label: string }> {
  const db = await sb();
  const { data } = await db
    .from("properties")
    .select("host_id, hosts(business_name)")
    .eq("id", propertyId)
    .maybeSingle();
  const hostId = (data?.host_id as string | undefined) ?? "unknown";
  const label = (
    (data?.hosts as { business_name?: string } | null)?.business_name ?? "Business"
  ).slice(0, 80);
  return { key: hostId, label };
}

/** For Latchkey admin: how many files wait for Drive, and the latest problem. */
export async function driveQueueStatus(): Promise<{
  driveConnected: boolean;
  waiting: number;
  oldest: string | null;
  lastError: string | null;
}> {
  const db = await sb();
  const list = () =>
    db.from("drive_queue").select("created_at, last_error", { count: "exact" }).order("created_at");
  const latest = await list().is("moved_to", null).limit(1);
  // Before migration 0078 every row is waiting.
  const { data, count } = latest.error ? await list().limit(1) : latest;
  const first = (data ?? [])[0] as { created_at?: string; last_error?: string | null } | undefined;
  return {
    driveConnected: await driveReady(),
    waiting: count ?? 0,
    oldest: first?.created_at ?? null,
    lastError: first?.last_error ?? null,
  };
}
