import { createFileRoute } from "@tanstack/react-router";

import { HostShell } from "@/components/host/HostShell";

export const Route = createFileRoute("/_authenticated/app")({
  component: HostShell,
});
