/**
 * Is this guest link or door PIN free? Checked against every property on
 * Latchkey (with the server's access, since hosts can't see each other's),
 * answering only "free" or "taken", never whose. A property's own link and
 * PIN count as free for it. Rules in property-codes.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanLink, linkAlternatives, linkProblem, weakPin } from "@/lib/property-codes";

const uuid = z.string().uuid();

const server = () => import("./property-codes.server");

const context = z.object({
  propertyId: uuid.nullish(),
  name: z.string().max(200).default(""),
  address: z.string().max(400).nullish(),
  postcode: z.string().max(20).nullish(),
});

/** A free guest link for a new property, made from its name. */
export const suggestGuestLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => context.parse(d))
  .handler(async ({ data }) => ({ code: await (await server()).freeGuestLink(data, data.propertyId) }));

/** Whether the link typed is usable and free; if taken, up to three free ones like it. */
export const checkGuestLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => context.extend({ code: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { takenAmong } = await server();
    const code = cleanLink(data.code);
    const problem = linkProblem(code);
    if (problem && problem !== "reserved") return { code, problem, available: false, suggestions: [] as string[] };
    const taken = problem === "reserved" ? new Set([code]) : await takenAmong("short_code", [code], data.propertyId);
    if (!taken.has(code)) return { code, problem: null, available: true, suggestions: [] as string[] };
    // Ask about a generous batch at once, then offer the first three free ones.
    const pool = linkAlternatives(code, data, () => true, 40);
    const used = await takenAmong("short_code", pool, data.propertyId);
    return { code, problem, available: false, suggestions: linkAlternatives(code, data, (c) => !used.has(c)) };
  });

/** Whether a door PIN typed is free (and whether it's an easy guess). Slowed a little so it can't be used to sweep PINs. */
export const checkDoorPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pin: z.string().regex(/^\d{6}$/), propertyId: uuid.nullish() }).parse(d))
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 400));
    const { takenAmong } = await server();
    const taken = await takenAmong("check_in_pin", [data.pin], data.propertyId);
    return { available: !taken.has(data.pin), weak: weakPin(data.pin) };
  });

/** A fresh free door PIN. */
export const newDoorPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: uuid.nullish() }).parse(d))
  .handler(async ({ data }) => ({ pin: await (await server()).freeDoorPin(data.propertyId) }));
