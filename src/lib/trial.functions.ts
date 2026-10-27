/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Saving a free trial with Google or Apple. The trial runs on an anonymous
 * account (the visitor's handle); a social sign-in comes back as a different
 * account, so a one-time claim made by the anonymous account hands its
 * business over to whoever signs in with it. Email instead keeps the very
 * same account (it gets the email, then a password).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Loose = { from: (t: string) => any };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose & {
    auth: {
      admin: {
        getUserById: (id: string) => Promise<{ data: { user: { email?: string | null } | null } }>;
      };
    };
  };
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Called by the anonymous trial just before going to Google or Apple. */
export const startTrialClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as { is_anonymous?: boolean };
    if (!claims.is_anonymous) return { code: null };
    const code = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const db = await admin();
    const { error } = await db.from("trial_claims").insert({
      code_hash: await sha256(code),
      anon_user_id: context.userId,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    if (error)
      throw new Error(
        error.message.includes("trial_claims")
          ? "Signing in with Google or Apple needs the latest update (migration 0033)."
          : error.message,
      );
    return { code };
  });

/** Called by the account that came back from Google or Apple: it takes over the trial's business. */
export const completeTrialClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^[a-f0-9]{48}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { is_anonymous?: boolean; email?: string };
    if (claims.is_anonymous) return { moved: 0 };
    const db = await admin();
    const hash = await sha256(data.code);
    const { data: claim } = await db
      .from("trial_claims")
      .select("anon_user_id, expires_at, used_at")
      .eq("code_hash", hash)
      .maybeSingle();
    if (!claim || claim.used_at || Date.parse(claim.expires_at) < Date.now()) return { moved: 0 };
    // One use only, even if two tabs race.
    const { data: taken } = await db
      .from("trial_claims")
      .update({ used_at: new Date().toISOString(), used_by: context.userId })
      .eq("code_hash", hash)
      .is("used_at", null)
      .select("code_hash");
    if (!taken?.length || claim.anon_user_id === context.userId) return { moved: 0 };

    const { data: memberships } = await db
      .from("host_members")
      .select("host_id, role")
      .eq("user_id", claim.anon_user_id);
    let moved = 0;
    for (const m of (memberships ?? []) as Array<{ host_id: string; role: string }>) {
      const { data: already } = await db
        .from("host_members")
        .select("host_id")
        .eq("host_id", m.host_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!already)
        await db
          .from("host_members")
          .insert({ host_id: m.host_id, user_id: context.userId, role: "owner" });
      await db
        .from("host_members")
        .delete()
        .eq("host_id", m.host_id)
        .eq("user_id", claim.anon_user_id);
      // Keep the lead: the business gets the email they signed in with, if it had none.
      if (claims.email)
        await db
          .from("hosts")
          .update({ contact_email: claims.email.toLowerCase() })
          .eq("id", m.host_id)
          .is("contact_email", null);
      moved++;
    }
    // Their name from the trial, unless the account already has one.
    const { data: oldProfile } = await db
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", claim.anon_user_id)
      .maybeSingle();
    const { data: newProfile } = await db
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oldProfile?.display_name && !newProfile?.display_name) {
      await db.from("user_profiles").upsert({
        user_id: context.userId,
        display_name: oldProfile.display_name,
        updated_at: new Date().toISOString(),
      });
    }
    return { moved };
  });

/** The trial's name, saved before signing in so the account keeps it. */
export const saveTrialName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { error } = await db.from("user_profiles").upsert({
      user_id: context.userId,
      display_name: data.name,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
