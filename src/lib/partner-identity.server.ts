/**
 * Hashing for Commission Partner identity keys. Server only. HMAC-SHA256 with
 * PARTNER_IDENTITY_HASH_SECRET over normalised values (partner-identity.ts),
 * so the same email or card always gives the same hash but the hash can't be
 * reversed without the secret. IP addresses get a stable hash here (unlike
 * the one-day analytics hash) because fraud checks compare across days;
 * they're purged after IP_HASH_RETENTION_DAYS by the month-close job.
 */
import { createHmac } from "crypto";

import type { IdentityValue } from "./partner-identity";

export class PartnerHashNotSetUp extends Error {
  constructor() {
    super("PARTNER_IDENTITY_HASH_SECRET isn't set, so Commission Partner checks can't run yet.");
  }
}

function secret(): string {
  const s = process.env["PARTNER_IDENTITY_HASH_SECRET"];
  if (!s || s.length < 16) throw new PartnerHashNotSetUp();
  return s;
}

export function identityHash(kind: string, value: string): string {
  return createHmac("sha256", secret()).update(`${kind}|${value}`).digest("hex");
}

export function hashValues(
  values: IdentityValue[],
): Array<{ kind: IdentityValue["kind"]; value_hash: string }> {
  return values.map((v) => ({ kind: v.kind, value_hash: identityHash(v.kind, v.value) }));
}

/** A stable, salted hash of an IP address or device id for cross-day fraud checks. */
export function stableHash(kind: "ip" | "device", value: string | null | undefined): string | null {
  return value ? identityHash(kind, value.trim().toLowerCase()) : null;
}
