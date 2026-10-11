/**
 * Team access: owners invite people by email as owner, manager or viewer.
 * Everyone signs in with their own account and can belong to several hosts.
 * RLS on host_members / host_invitations is the authority (migration 0017);
 * these functions add clear errors, rate limits and the invitation email.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotSharedDemo } from "@/lib/demo-account";
import { OWNER_ONLY, displayRole, normaliseEmail, requireOwner } from "@/lib/roles";

const uuid = z.string().uuid();
const inviteRole = z.enum(["owner", "manager", "viewer"]);
const inviteToken = z.string().min(20).max(100);
const SITE_URL = "https://latchkey.omsestates.uk";
const INVITES_PER_DAY = 20;

/** Tables and functions from migration 0017, before the generated types know them. */
type Untyped = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { code?: string; message: string } | null }>;
};
const untyped = (client: unknown) => client as Untyped;

/** The role, in words, for the invitation email. */
const ROLE_LINES: Record<z.infer<typeof inviteRole>, string> = {
  owner: "As an owner you can do everything, including billing and managing the team.",
  manager: "As a manager you can run rooms, calendars, bookings, guides and requests.",
  viewer: "As a viewer you can see everything but not change anything.",
};

function siteOrigin(): string {
  try {
    return new URL(getRequest()?.url ?? SITE_URL).origin;
  } catch {
    return SITE_URL;
  }
}

async function newInviteToken() {
  const { createHash, randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("base64url");
  // Must match public.invitation_hash(): sha256 of the token, hex.
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

async function sendInvite(args: { to: string; hostName: string; inviter: string; role: z.infer<typeof inviteRole>; token: string }) {
  const { sendTemplateEmail } = await import("./email-templates/send-email");
  try {
    const res = await sendTemplateEmail("team-invite", args.to, {
      templateData: {
        hostName: args.hostName,
        inviter: args.inviter,
        roleLine: ROLE_LINES[args.role],
        url: `${siteOrigin()}/invite/${args.token}`,
      },
    });
    return res.sent;
  } catch (err) {
    console.error("Invite email failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Members (with emails) and, for owners, open invitations. */
export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = untyped(context.supabase);
    const { data: members, error } = await db.rpc("host_team", { _host_id: data.hostId });
    if (error) throw new Error(error.message);
    // RLS returns no invitations to anyone but owners.
    const { data: invites } = await db
      .from("host_invitations")
      .select("id, email, role, created_at, expires_at")
      .eq("host_id", data.hostId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return {
      members: ((members ?? []) as Array<{ user_id: string; email: string; role: string; created_at: string }>).map((m) => ({
        userId: m.user_id,
        email: m.email,
        role: displayRole(m.role),
        isYou: m.user_id === context.userId,
      })),
      invites: ((invites ?? []) as Array<{ id: string; email: string; role: string; created_at: string; expires_at: string }>).map((i) => ({
        id: i.id,
        email: i.email,
        role: displayRole(i.role),
        expired: Date.parse(i.expires_at) < Date.now(),
      })),
    };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, email: z.string().trim().email().max(254), role: inviteRole }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    await requireOwner(context.supabase, data.hostId);
    const db = untyped(context.supabase);
    const email = normaliseEmail(data.email);

    const { count } = await db
      .from("host_invitations")
      .select("id", { count: "exact", head: true })
      .eq("host_id", data.hostId)
      .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= INVITES_PER_DAY) throw new Error("That's a lot of invitations for one day. Please try again tomorrow.");

    const { data: team } = await db.rpc("host_team", { _host_id: data.hostId });
    if (((team ?? []) as Array<{ email: string }>).some((m) => normaliseEmail(m.email ?? "") === email)) {
      throw new Error("That person is already on your team.");
    }

    // One open invitation per address: a new one replaces the old.
    await db
      .from("host_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("host_id", data.hostId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);

    const t = await newInviteToken();
    const { error } = await db.from("host_invitations").insert({
      host_id: data.hostId,
      email,
      role: data.role,
      token_hash: t.hash,
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);

    const { data: host } = await context.supabase.from("hosts").select("business_name").eq("id", data.hostId).single();
    const emailed = await sendInvite({
      to: email,
      hostName: host?.business_name ?? "a host",
      inviter: (context.claims?.email as string | undefined) ?? "The owner",
      role: data.role,
      token: t.token,
    });
    return { ok: true, emailed };
  });

/** Sends a fresh link (the old one stops working) and restarts the 7 days. */
export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inviteId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const db = untyped(context.supabase);
    const { data: inv } = await db
      .from("host_invitations")
      .select("id, host_id, email, role")
      .eq("id", data.inviteId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (!inv) throw new Error("That invitation is no longer open.");
    await requireOwner(context.supabase, inv.host_id);
    const t = await newInviteToken();
    const { error } = await db
      .from("host_invitations")
      .update({ token_hash: t.hash, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
      .eq("id", inv.id);
    if (error) throw new Error(error.message);
    const { data: host } = await context.supabase.from("hosts").select("business_name").eq("id", inv.host_id).single();
    const emailed = await sendInvite({
      to: inv.email,
      hostName: host?.business_name ?? "a host",
      inviter: (context.claims?.email as string | undefined) ?? "The owner",
      role: displayRole(inv.role),
      token: t.token,
    });
    return { ok: true, emailed };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inviteId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await untyped(context.supabase)
      .from("host_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.inviteId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error(OWNER_ONLY);
    return { ok: true };
  });

export const changeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, userId: uuid, role: inviteRole }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    // The database keeps at least one owner and says so in the error.
    const { data: rows, error } = await context.supabase
      .from("host_members")
      .update({ role: data.role as never })
      .eq("host_id", data.hostId)
      .eq("user_id", data.userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("That person isn't on this team.");
    return { ok: true };
  });

/** Owners remove anyone; access ends on that person's next request. */
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    const { data: rows, error } = await context.supabase
      .from("host_members")
      .delete()
      .eq("host_id", data.hostId)
      .eq("user_id", data.userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("That person isn't on this team.");
    return { ok: true };
  });

export const leaveHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const { error } = await context.supabase
      .from("host_members")
      .delete()
      .eq("host_id", data.hostId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function rememberHost(db: Untyped, userId: string, hostId: string) {
  const { error } = await db
    .from("user_prefs")
    .upsert({ user_id: userId, last_host_id: hostId, updated_at: new Date().toISOString() });
  if (error) console.error("Couldn't save the active host", error.message);
}

/** Switches the workspace shown to this user. */
export const setActiveHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("host_members")
      .select("id")
      .eq("host_id", data.hostId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("You're no longer on that team.");
    await rememberHost(untyped(context.supabase), context.userId, data.hostId);
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: inviteToken }).parse(d))
  .handler(async ({ data, context }) => {
    assertNotSharedDemo(context.claims);
    const db = untyped(context.supabase);
    const { data: hostId, error } = await db.rpc("accept_host_invitation", { _token: data.token });
    if (error) throw new Error(error.message);
    await rememberHost(db, context.userId, hostId as string);
    return { hostId: hostId as string };
  });

/** Public: what the invite page may show before anyone signs in. */
export const peekInvite = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: inviteToken }).parse(d))
  .handler(async ({ data }) => {
    const { admin } = await import("./checkin.server");
    const { data: rows } = await untyped(await admin()).rpc("peek_invitation", { _token: data.token });
    const row = (rows as Array<{ business_name: string; role: string; email_masked: string; status: string }> | null)?.[0];
    if (!row) return { found: false as const };
    return {
      found: true as const,
      hostName: row.business_name,
      role: displayRole(row.role),
      emailMasked: row.email_masked,
      status: row.status as "open" | "used" | "expired" | "revoked",
    };
  });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type ActivityRow = {
  id: number;
  actor: string;
  table: string;
  action: "insert" | "update" | "delete";
  changed: { [key: string]: Json } | null;
  at: string;
};

type AuditRecord = {
  id: number | string;
  actor_email: string | null;
  table_name: string;
  action: ActivityRow["action"];
  changed: ActivityRow["changed"];
  at: string;
};

/** Owner-only change history, newest first, 50 at a time. */
export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hostId: uuid, before: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context.supabase, data.hostId);
    let q = untyped(context.supabase)
      .from("audit_log")
      .select("id, actor_email, table_name, action, changed, at")
      .eq("host_id", data.hostId)
      .order("id", { ascending: false })
      .limit(50);
    if (data.before) q = q.lt("id", data.before);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const items: ActivityRow[] = ((rows ?? []) as AuditRecord[]).map((r) => ({
      id: Number(r.id),
      actor: r.actor_email ?? "system",
      table: r.table_name,
      action: r.action,
      changed: r.changed ?? null,
      at: r.at,
    }));
    return { items, more: items.length === 50 };
  });
