import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarX, Check, MessageCircle, Wifi } from "lucide-react";

import { ExpandableText } from "@/components/guest/ExpandableText";
import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { sectionIcon } from "@/components/guest/guide-icons";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { guideCopy as gcopy, guest as copy, roomGuideCopy as rcopy } from "@/content/copy";
import { getRoomGuide } from "@/lib/guide.functions";
import { rememberedStay } from "@/lib/stay-link";

/**
 * The guide behind the QR code in a room: how this room works, wifi, today's
 * closed times and the house rules. No login or app. A guest staying now is
 * offered their own stay (messages, extras); anyone else can check in.
 */
export const Route = createFileRoute("/room/$code")({
  loader: ({ params }) => getRoomGuide({ data: { code: params.code } }),
  head: () => ({
    meta: [
      { title: "Your room guide — Latchkey" },
      { name: "description", content: "How this room works: wifi, heating, shower, quiet hours and check-out." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: RoomGuide,
});

function forgetIcon(key: string) {
  return key === "today" ? CalendarX : sectionIcon(key);
}

function RoomGuide() {
  const g = Route.useLoaderData();
  const [stay, setStay] = useState<string | null>(null);
  useEffect(() => {
    if (g.found) setStay(rememberedStay(g.propertyId));
  }, [g]);

  if (!g.found) {
    return (
      <GuestFrame>
        <GuestMessage text={rcopy.gone} />
      </GuestFrame>
    );
  }

  return (
    <GuestFrame theme={g.theme} name={g.propertyName}>
      <main className="mx-auto max-w-4xl space-y-6 py-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">{rcopy.eyebrow}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl">{g.room.title || g.room.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{rcopy.subtitle(g.propertyName)}</p>
        </header>

        <section className="card-soft flex flex-wrap items-center gap-3 p-5">
          <MessageCircle className="size-6 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-lg">{stay ? rcopy.yourStay : rcopy.needSomething}</p>
          <Button asChild size="lg" className="h-12">
            <a href={stay ? `/stay/${stay}` : `/p/${g.shortCode}`}>{stay ? rcopy.openStay : rcopy.checkIn}</a>
          </Button>
        </section>

        {g.forget.length ? (
          <section aria-labelledby="forget" className="rounded-3xl border-2 border-accent/40 bg-accent/10 p-5">
            <h2 id="forget" className="text-xl">{gcopy.forgetTitle}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {g.forget.map((f, i) => {
                const Icon = forgetIcon(f.key);
                return (
                  <li key={i} className="flex min-h-12 items-start gap-3 rounded-2xl bg-surface px-4 py-3 text-lg">
                    <Icon className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
                    <ExpandableText text={f.text} className="text-lg" />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {g.wifi ? (
          <section className="card-soft flex flex-wrap items-center gap-3 p-5">
            <Wifi className="size-6 text-primary" aria-hidden />
            <span className="text-lg">
              {copy.stayNetwork}: <span className="font-medium">{g.wifi.name}</span>
            </span>
            {g.wifi.password ? (
              <span className="text-lg">
                {copy.stayPassword}: <span className="font-mono font-medium">{g.wifi.password}</span>
              </span>
            ) : null}
          </section>
        ) : null}

        {g.amenities.length ? (
          <section aria-labelledby="amenities" className="card-soft p-5">
            <h2 id="amenities" className="text-xl">{gcopy.amenitiesTitle}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {g.amenities.map((a) => (
                <li key={a} className="flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-base">
                  <Check className="size-4 text-primary" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Accordion type="multiple" defaultValue={[g.guide[0]?.key ?? ""]} className="space-y-3">
          {g.guide.map((sec) => {
            const Icon = sectionIcon(sec.key);
            return (
              <AccordionItem key={sec.key} value={sec.key} className="card-soft border-0 px-5">
                <AccordionTrigger className="min-h-16 text-left font-display text-xl hover:no-underline">
                  <span className="flex items-center gap-3">
                    <Icon className="size-6 text-primary" aria-hidden />
                    {sec.title}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5 text-base">
                  {sec.summary ? <ExpandableText text={sec.summary} className="text-lg" /> : null}
                  {sec.steps.length ? (
                    <ol className="space-y-4">
                      {sec.steps.map((st, i) => (
                        <li key={i} className="flex gap-4">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{i + 1}</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            {st.heading ? <p className="text-lg font-medium">{st.heading}</p> : null}
                            {st.body ? <ExpandableText text={st.body} className="text-muted-foreground" /> : null}
                            {st.imageUrl ? (
                              <img src={st.imageUrl} alt={gcopy.photoAlt(st.heading || sec.title)} loading="lazy" className="max-h-80 w-full rounded-2xl object-cover" />
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        <p className="text-center text-sm text-muted-foreground">{rcopy.footer}</p>
      </main>
    </GuestFrame>
  );
}
