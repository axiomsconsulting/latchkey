import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/LegalPage";
import { termsOfService } from "@/content/legal";
import { rebrand } from "@/lib/brand";
import { getLegalDetails } from "@/lib/site.functions";

/** Terms of service for businesses using Latchkey (wording in src/content/legal.ts). */
export const Route = createFileRoute("/terms")({
  loader: () => getLegalDetails(),
  head: () => ({ meta: [{ title: rebrand("Terms of service — Latchkey") }, { name: "description", content: rebrand("The terms for businesses using Latchkey.") }] }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage doc={termsOfService(Route.useLoaderData())} />;
}
