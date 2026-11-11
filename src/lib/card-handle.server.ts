/** Door tablet cards carry a stay as a signed handle that lasts 12 hours, never the booking's id. */

export async function handleFor(bookingId: string, propertyId: string): Promise<string> {
  const { createHmac } = await import("crypto");
  const exp = Date.now() + 12 * 3_600_000;
  const body = `${Buffer.from(bookingId).toString("base64url")}.${exp}`;
  const mac = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${body}.${propertyId}`)
    .digest("base64url");
  return `${body}.${mac}`;
}

export async function readHandle(handle: string, propertyId: string): Promise<string | null> {
  const { createHmac, timingSafeEqual } = await import("crypto");
  const [id64, exp, mac] = handle.split(".");
  if (!id64 || !exp || !mac || Number(exp) < Date.now()) return null;
  const want = createHmac("sha256", `goodbye:${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? ""}`)
    .update(`${id64}.${exp}.${propertyId}`)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(id64, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
