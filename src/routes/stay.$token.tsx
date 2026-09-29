import { createFileRoute } from "@tanstack/react-router";
import { CalendarX, Check, Wifi } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { ExpandableText } from "@/components/guest/ExpandableText";
import { StayExtras } from "@/components/guest/StayExtras";
import { StayServices } from "@/components/guest/StayServices";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { guestGuideIcons } from "@/components/guest/guide-icons";
import { guideCopy as gcopy, guest as copy } from "@/content/copy";
import { getStay } from "@/lib/checkin.functions";

export const Route = createFileRoute("/stay/$token")({
  loader: ({ params }) => getStay({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Your stay guide — Latchkey" },
      { name: "description", content: "Your private step-by-step guide for your stay." },
      { property: "og:title", content: "Your stay guide — Latchkey" },
      { property: "og:description", content: "Your private step-by-step guide for your stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <GuestFrame>
      <GuestMessage text={copy.error} />
    </GuestFrame>
  ),
  component: Stay,
});

/** Reminder rows reuse the section's own icon; "today" is a one-off closure. */
function forgetIcon(key: string) {
  return key === "today" ? CalendarX : (guestGuideIcons[key as keyof typeof guestGuideIcons] ?? CalendarX);
}

function Stay() {
  const s = Route.useLoaderData();
  const { token } = Route.useParams();
  if (!s.found) {
    const opens = "opensAt" in s && s.opensAt
      ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(new Date(s.opensAt))
      : null;
    return (
      <GuestFrame>
        <GuestMessage text={opens ? gcopy.notYet(opens) : copy.stayGone} />
      </GuestFrame>
    );
  }
  const p = s.property;
  return (
    <GuestFrame theme={s.theme} name={p?.name ?? undefined}>
      <main className="mx-auto max-w-4xl space-y-6 py-8">
        <div>
          <h1 className="text-3xl sm:text-5xl">{copy.stayTitle(s.firstName)}</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {s.room ? copy.roomLine(s.room.display_name, s.room.public_title) : p?.name}
          </p>
        </div>

        <section aria-labelledby="forget" className="rounded-3xl border-2 border-accent/40 bg-accent/10 p-5">
          <h2 id="forget" className="text-xl">{gcopy.forgetTitle}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.forget.map((f, i) => {
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

        {s.amenities.length ? (
          <section aria-labelledby="amenities" className="card-soft p-5">
            <h2 id="amenities" className="text-xl">{gcopy.amenitiesTitle}</h2>
            <p className="mt-1 text-muted-foreground">{gcopy.amenitiesBody}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {s.amenities.map((a) => (
                <li key={a} className="flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-base">
                  <Check className="size-4 text-primary" aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {p?.wifi_name ? (
          <section className="card-soft flex flex-wrap items-center gap-3 p-5">
            <Wifi className="size-6 text-primary" aria-hidden />
            <span className="text-lg">
              {copy.stayNetwork}: <span className="font-medium">{p.wifi_name}</span>
            </span>
            {p.wifi_password ? (
              <span className="text-lg">
                {copy.stayPassword}: <span className="font-mono font-medium">{p.wifi_password}</span>
              </span>
            ) : null}
          </section>
        ) : null}

        <Accordion type="multiple" defaultValue={[s.guide[0]?.key ?? ""]} className="space-y-3">
          {s.guide.map((sec) => {
            const Icon = guestGuideIcons[sec.key];
            return (
              <AccordionItem key={sec.key} value={sec.key} className="card-soft border-0 px-5">
                <AccordionTrigger className="min-h-16 text-left font-display text-xl hover:no-underline">
                  <span className="flex items-center gap-3">
                    <Icon className="size-6 text-primary" aria-hidden />
                    {sec.title}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5 text-base">
                  {sec.summary === "DOOR_LOCKED" ? (
                    <p className="text-lg">{gcopy.doorLocked(new Intl.DateTimeFormat("en-GB", { timeZone: p?.timezone ?? "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s.doorOpensAt)))}</p>
                  ) : sec.summary ? <ExpandableText text={sec.summary} className="text-lg" /> : null}
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

        {s.readOnly ? <p className="card-soft p-5 text-lg">{gcopy.readOnly}</p> : (<><StayExtras token={token} /><StayServices token={token} /></>)}
      </main>
    </GuestFrame>
  );
}
