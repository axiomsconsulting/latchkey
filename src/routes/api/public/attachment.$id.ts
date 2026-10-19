import { createFileRoute } from "@tanstack/react-router";

/**
 * One guide attachment, shown in the app (never a download link to Drive).
 * Only with a valid, unexpired signature made by this server for this file.
 */
export const Route = createFileRoute("/api/public/attachment/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const expires = Number(url.searchParams.get("e"));
        const sig = url.searchParams.get("s") ?? "";
        const { verifyAttachment } = await import("@/lib/attachments");
        const { signingSecret } = await import("@/lib/attachments.server");
        if (!/^[0-9a-f-]{36}$/i.test(params.id) || !(await verifyAttachment(signingSecret(), params.id, expires, sig))) {
          return new Response("This link has expired. Reopen the guide to see it.", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as unknown as { from: (t: string) => any })
          .from("guide_attachments")
          .select("file_id, kind, mime, name")
          .eq("id", params.id)
          .maybeSingle();
        if (!data) return new Response("Not found.", { status: 404 });
        const { readAttachment } = await import("@/lib/drive.server");
        const res = await readAttachment(data.file_id, data.kind);
        if (!res.ok || !res.body) return new Response("Couldn't open this attachment just now.", { status: 502 });
        const type = data.kind === "image" ? data.mime : "application/pdf";
        const ext = type === "application/pdf" ? "pdf" : (data.mime.split("/")[1] ?? "bin");
        return new Response(res.body, {
          headers: {
            "content-type": type,
            "content-disposition": `inline; filename="${String(data.name).replace(/[^\w .-]/g, "")}.${ext}"`,
            "cache-control": "private, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
