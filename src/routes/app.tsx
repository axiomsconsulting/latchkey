import { createFileRoute } from "@tanstack/react-router";

import { HostShell } from "@/components/host/HostShell";

export const Route = createFileRoute("/app")({
  component: HostShell,
});
