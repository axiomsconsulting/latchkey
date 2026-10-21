/**
 * Server only: a visitor's IP address as a one-day pseudonym. The day and a
 * server secret go into the hash, so it can't be turned back into the
 * address (or matched across days). Used for demo rate limits and visitor
 * analytics instead of storing raw addresses.
 */
import { createHash } from "node:crypto";

export function requestIp(h: Headers): string | null {
  return (h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;
}

export function hashIp(ip: string | null, day: string = new Date().toISOString().slice(0, 10)): string | null {
  if (!ip) return null;
  const pepper = process.env["IP_HASH_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createHash("sha256").update(`${day}|${ip}|${pepper}`).digest("hex").slice(0, 32);
}
