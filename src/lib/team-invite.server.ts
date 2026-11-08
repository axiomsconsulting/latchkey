/* eslint-disable @typescript-eslint/no-explicit-any -- tables from migration 0017, before the generated types know them */
/**
 * Team invitations on the server: the token, the email, and making one
 * (the owner's Team panel, and a Commission Partner handing over a business
 * they set up, agreement v1.3 6.9). Server only: it reads the request.
 */
import { getRequest } from "@tanstack/react-start/server";

import { normaliseEmail } from "@/lib/roles";

type Role = "owner" | "manager" | "viewer";
const SITE_URL = "https://latchkey.omsestates.uk";
const INVITES_PER_DAY = 20;

type Untyped = {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: any; error: { code?: string; message: string } | null }>;
};
const untyped = (client: unknown) => client as Untyped;

/** The role, in words, for the invitation email. */
const ROLE_LINES: Record<Role, string> = {
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

export async function newInviteToken() {
  const { createHash, randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("base64url");
  // Must match public.invitation_hash(): sha256 of the token, hex.
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

export async function sendInvite(args: {
  to: string;
  hostName: string;
  inviter: string;
  role: Role;
  token: string;
}) {
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

async function ownPropertyIds(supabase: unknown, hostId: string, ids: string[]): Promise<string[]> {
  const { data } = await (supabase as { from: (t: string) => any })
    .from("properties")
    .select("id")
    .eq("host_id", hostId)
    .in("id", ids);
  const ok = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (!ok.length) throw new Error("Pick at least one of your properties.");
  return ok;
}

/**
 * Makes an invitation and emails it (the owner's Team panel, and a Commission
 * Partner handing over a business they set up). The caller has checked the
 * signed-in user is an owner; `supabase` is their client, so RLS applies.
 */
export async function createInvitation(
  supabase: unknown,
  data: {
    hostId: string;
    email: string;
    role: "owner" | "manager" | "viewer";
    propertyIds: string[] | null;
    invitedBy: string;
    inviterEmail: string | null;
  },
): Promise<{ ok: true; emailed: boolean }> {
  const db = untyped(supabase);
  const email = normaliseEmail(data.email);

  const { count } = await db
    .from("host_invitations")
    .select("id", { count: "exact", head: true })
    .eq("host_id", data.hostId)
    .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= INVITES_PER_DAY)
    throw new Error("That's a lot of invitations for one day. Please try again tomorrow.");

  const { count: toAddress } = await db
    .from("host_invitations")
    .select("id", { count: "exact", head: true })
    .eq("host_id", data.hostId)
    .eq("email", email)
    .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((toAddress ?? 0) >= 3)
    throw new Error("That address has had several invitations today. Please try again tomorrow.");

  const { data: team } = await db.rpc("host_team", { _host_id: data.hostId });
  if (
    ((team ?? []) as Array<{ email: string }>).some((m) => normaliseEmail(m.email ?? "") === email)
  ) {
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
  const row = {
    host_id: data.hostId,
    email,
    role: data.role,
    token_hash: t.hash,
    invited_by: data.invitedBy,
  };
  // Only some properties (a property's own manager): owners always cover everything.
  const ids =
    data.role !== "owner" && data.propertyIds?.length
      ? await ownPropertyIds(supabase as never, data.hostId, data.propertyIds)
      : null;
  const { withLegacy } = await import("./checkin.server");
  const { error } = await withLegacy(
    () => db.from("host_invitations").insert({ ...row, property_ids: ids }),
    () => db.from("host_invitations").insert(row),
  );
  if (error) throw new Error(error.message);

  const { data: host } = await db
    .from("hosts")
    .select("business_name")
    .eq("id", data.hostId)
    .single();
  const emailed = await sendInvite({
    to: email,
    hostName: host?.business_name ?? "a host",
    inviter: data.inviterEmail ?? "The owner",
    role: data.role,
    token: t.token,
  });
  return { ok: true, emailed };
}
