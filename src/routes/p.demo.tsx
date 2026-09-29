import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old demo link: guests now start from the PIN page or their property link. */
export const Route = createFileRoute("/p/demo")({
  beforeLoad: () => {
    throw redirect({ to: "/checkin" });
  },
});
