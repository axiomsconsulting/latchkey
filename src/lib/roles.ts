/**
 * Team roles, as the app sees them. RLS in the database is the authority;
 * these rules decide what the screens offer and give clear errors early.
 *   owner          everything, including billing, members and deleting
 *   manager        runs the business (old co_host rows count as managers)
 *   viewer/cleaner read only
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type HostRole = "owner" | "manager" | "viewer" | "co_host" | "cleaner";
export type InviteRole = "owner" | "manager" | "viewer";

export const INVITE_ROLES: InviteRole[] = ["manager", "viewer", "owner"];

export const READ_ONLY = "You have read-only access to this host.";
export const OWNER_ONLY = "Only the owner can do that.";

export function canWrite(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager" || role === "co_host";
}

export function isOwner(role: string | null | undefined): boolean {
  return role === "owner";
}

/** The role shown to people: legacy names fold into the new ones. */
export function displayRole(role: string | null | undefined): InviteRole {
  if (role === "owner") return "owner";
  if (role === "manager" || role === "co_host") return "manager";
  return "viewer";
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "jane@example.com" → "j***@example.com", for showing an invite's address safely. */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = normaliseEmail(email).split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

type Client = SupabaseClient<Database>;

/** Server functions call these with the caller's client before writing. */
export async function requireWrite(supabase: Client, hostId: string) {
  // is_host_staff covers managers once migration 0017 is applied.
  const { data } = await supabase.rpc("is_host_staff", { _host_id: hostId });
  if (data !== true) throw new Error(READ_ONLY);
}

export async function requireOwner(supabase: Client, hostId: string) {
  const { data } = await supabase.rpc("has_host_role", { _host_id: hostId, _role: "owner" });
  if (data !== true) throw new Error(OWNER_ONLY);
}

export async function hostOfProperty(supabase: Client, propertyId: string): Promise<string> {
  const { data } = await supabase.rpc("property_host_id", { _property_id: propertyId });
  if (!data) throw new Error("Property not found.");
  return data;
}

export const SUPER_ADMIN_ONLY = "Only Latchkey's admins can change that.";

export async function isSuperAdmin(supabase: unknown): Promise<boolean> {
  const { data } = await (supabase as { rpc: (fn: string) => Promise<{ data: unknown }> }).rpc(
    "is_super_admin",
  );
  return data === true;
}

/** Latchkey-wide controls (demo/live switches, sample data): super admins only. */
export async function requireSuperAdmin(supabase: unknown) {
  if (!(await isSuperAdmin(supabase))) throw new Error(SUPER_ADMIN_ONLY);
}
