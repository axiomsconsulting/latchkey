import { createFileRoute, redirect } from "@tanstack/react-router";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { guest as copy } from "@/content/copy";
import { rebrand } from "@/lib/brand";
import { openShortLink } from "@/lib/stay-links.functions";

/** /g/<three-words>: the short link shown at the end of check-in, straight to the stay guide. */
export const Route = createFileRoute("/g/$code")({
  head: () => ({
    meta: [{ title: rebrand("Your stay · Latchkey") }, { name: "robots", content: "noindex" }],
  }),
  loader: async ({ params }) => {
    const r = await openShortLink({ data: { code: params.code } });
    if (r.token) throw redirect({ to: "/stay/$token", params: { token: r.token } });
    return null;
  },
  component: () => (
    <GuestFrame>
      <GuestMessage text={copy.shortLinkGone} />
    </GuestFrame>
  ),
});
