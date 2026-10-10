import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old demo link: send it to the guest tour, which needs no PIN. */
export const Route = createFileRoute("/p/demo")({
  beforeLoad: () => {
    throw redirect({ to: "/p/$code", params: { code: "tour" } });
  },
});
