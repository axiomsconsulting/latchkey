import { createFileRoute } from "@tanstack/react-router";

/**
 * One private file (an ID photo, a selfie, a drawn signature or a signed
 * agreement), streamed from Google Drive or the queue. Only with a valid,
 * unexpired signature this server made for that file; never cached.
 */
export const Route = createFileRoute("/api/public/private-file/$ref")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const expires = Number(url.searchParams.get("e"));
        const name = url.searchParams.get("n") ?? "";
        const sig = url.searchParams.get("s") ?? "";
        const { verifyPrivateLink } = await import("@/lib/private-store");
        const { readPrivate, signingSecret } = await import("@/lib/private-store.server");
        const ref = await verifyPrivateLink(signingSecret(), params.ref, expires, name, sig);
        if (!ref)
          return new Response("This link has expired. Open the page again to see it.", {
            status: 403,
          });
        const file = await readPrivate(ref);
        if (!file) return new Response("This file isn't available just now.", { status: 404 });
        return new Response(file.bytes as unknown as BodyInit, {
          headers: {
            "content-type": file.mime,
            "content-disposition": `inline; filename="${name.replace(/[^\w.-]/g, "") || "file"}"`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
