import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old check-in address, still on printed QR cards and earlier links: the
 * check-in screen is /kiosk/<code> now, the full door-tablet version (phone
 * QR beside the welcome, screensaver). A phone held upright still opens the
 * guest's own version on its own; "carry on" links keep their place. The old demo link /p/demo goes to the guest tour.
 */
export const Route = createFileRoute("/p/$code")({
  validateSearch: (search: Record<string, unknown>): { resume?: string } =>
    typeof search["resume"] === "string" ? { resume: search["resume"] } : {},
  beforeLoad: ({ params, search }) => {
    const code = params.code === "demo" ? "tour" : params.code;
    throw redirect({ to: "/kiosk/$code", params: { code }, search: search.resume ? { resume: search.resume } : {}, replace: true });
  },
});
