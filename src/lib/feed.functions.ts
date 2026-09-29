import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Room sharing state plus the public feed link, if it is switched on. */
export const getRoomFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roomId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: room } = await context.supabase
      .from("rooms")
      .select("id, export_feed_enabled, feed_token")
      .eq("id", data.roomId)
      .single();
    return {
      enabled: room?.export_feed_enabled ?? false,
      token: (room?.feed_token as string | null) ?? null,
    };
  });

export const setRoomFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ roomId: uuid, enabled: z.boolean(), regenerate: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: room } = await context.supabase
      .from("rooms")
      .select("id, feed_token")
      .eq("id", data.roomId)
      .single();
    const token =
      data.regenerate || !room?.feed_token ? newToken() : (room.feed_token as string);
    const { error } = await context.supabase
      .from("rooms")
      .update({ export_feed_enabled: data.enabled, feed_token: token })
      .eq("id", data.roomId);
    if (error) throw new Error("Couldn't update the calendar sharing setting.");
    return { enabled: data.enabled, token };
  });
