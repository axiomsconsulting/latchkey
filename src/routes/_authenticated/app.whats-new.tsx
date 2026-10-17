import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/host/PageHeader";
import { ReleaseList } from "@/components/host/ReleaseList";
import { releasesFor } from "@/content/changelog";
import { whatsNewCopy as copy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";

export const Route = createFileRoute("/_authenticated/app/whats-new")({
  head: () => ({ meta: [{ title: "What's new · Latchkey" }] }),
  component: WhatsNewPage,
});

/** Every Latchkey update, newest first, in plain words. */
function WhatsNewPage() {
  const ws = useWorkspace();
  const releases = releasesFor({ admin: ws.data?.isSuperAdmin === true });
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <section className="card-soft p-6">
        <ReleaseList releases={releases} />
      </section>
    </div>
  );
}
