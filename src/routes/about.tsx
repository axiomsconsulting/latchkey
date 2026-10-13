import { createFileRoute } from "@tanstack/react-router";

import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { about as copy } from "@/content/copy";
import { RELEASES, featuresByArea, type ChangeKind } from "@/content/changelog";
import { formatUkDate } from "@/lib/dates";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About and what's new — Latchkey" },
      { name: "description", content: "Every change to Latchkey, and every feature it has." },
    ],
  }),
  component: AboutPage,
});

const kindStyle: Record<ChangeKind, string> = {
  new: "bg-primary text-primary-foreground",
  improved: "bg-secondary text-secondary-foreground",
  fixed: "bg-muted text-muted-foreground",
};

/** The change log and the features it adds up to, from src/content/changelog.ts. */
function AboutPage() {
  const groups = featuresByArea();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24">
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{copy.intro}</p>

        <Tabs defaultValue="changes" className="mt-8">
          <TabsList className="h-12 rounded-2xl p-1">
            <TabsTrigger value="changes" className="h-10 rounded-xl px-4">
              {copy.tabChanges}
            </TabsTrigger>
            <TabsTrigger value="features" className="h-10 rounded-xl px-4">
              {copy.tabFeatures}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="changes" className="mt-6">
            <ol className="space-y-6">
              {RELEASES.map((r) => (
                <li key={r.version} className="card-soft p-5">
                  <p className="text-sm text-muted-foreground">
                    {copy.version(r.version)} · {formatUkDate(r.date, { withYear: true })}
                  </p>
                  <h2 className="mt-1 text-xl">{r.title}</h2>
                  <ul className="mt-3 space-y-2">
                    {r.items.map((i) => (
                      <li key={i.text} className="flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${kindStyle[i.kind]}`}>
                          {copy.kinds[i.kind]}
                        </span>
                        <span>{i.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </TabsContent>

          <TabsContent value="features" className="mt-6 space-y-6">
            {groups.map((g) => (
              <section key={g.area} className="card-soft p-5">
                <h2 className="text-xl">{g.area}</h2>
                <ul className="mt-3 space-y-2">
                  {g.features.map((f) => (
                    <li key={f.text} className="flex items-start justify-between gap-4">
                      <span>{f.text}</span>
                      <Badge variant="outline" className="shrink-0">
                        {copy.since(f.version)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
