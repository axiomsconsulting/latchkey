import { createFileRoute, redirect } from "@tanstack/react-router";

/** The booking page moved to /book/<code>; old enquiry links (printed, shared, in emails) still arrive there. */
export const Route = createFileRoute("/enquire/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/book/$code", params: { code: params.code }, statusCode: 301 });
  },
});
