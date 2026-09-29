import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, CalendarX, Footprints, Moon, Wifi } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { StayServices } from "@/components/guest/StayServices";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { guestGuideIcons } from "@/components/guest/guide-icons";
import { guide as gcopy, guest as copy } from "@/content/copy";
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

const FORGET_ICONS = { quiet: Moon, shoes: Footprints, checkout: AlarmClock, unavailable: CalendarX } as const;

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
              const Icon = FORGET_ICONS[f.key];
              return (
                <li key={i} className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-lg">
                  <Icon className="size-6 shrink-0 text-accent" aria-hidden />
                  {f.text}
                </li>
              );
            })}
          </ul>
        </section>

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
                  {sec.summary ? <p className="text-lg">{sec.summary}</p> : null}
                  {sec.steps.length ? (
                    <ol className="space-y-4">
                      {sec.steps.map((st, i) => (
                        <li key={i} className="flex gap-4">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{i + 1}</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            {st.heading ? <p className="text-lg font-medium">{st.heading}</p> : null}
                            {st.body ? <p className="whitespace-pre-line text-muted-foreground">{st.body}</p> : null}
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

        <StayServices token={token} />
      </main>
    </GuestFrame>
  );
}
