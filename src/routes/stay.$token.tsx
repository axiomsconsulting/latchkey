import { useEffect, useState } from "react";
import { GuideAttachments, type Attachment } from "@/components/guest/GuideAttachments";
import { createFileRoute } from "@tanstack/react-router";
import { rememberStay } from "@/lib/stay-link";
import { CalendarX, Check, Wifi } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { ExpandableText } from "@/components/guest/ExpandableText";
import { StayExtras } from "@/components/guest/StayExtras";
import { StayInbox, openStayInbox } from "@/components/guest/StayInbox";
import { GuideTiles, StayCover, StayHelp, StaySummary } from "@/components/guest/StayHero";
import { shownTiles } from "@/lib/guide-tiles";
import { cn } from "@/lib/utils";
import { StayInvoice } from "@/components/guest/StayInvoice";
import { StayReview } from "@/components/guest/StayReview";
import { StayServices } from "@/components/guest/StayServices";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sectionIcon } from "@/components/guest/guide-icons";
import { guideCopy as gcopy, guest as copy, stayHeroCopy } from "@/content/copy";
import { getStay } from "@/lib/checkin.functions";
import { rebrand } from "@/lib/brand";
import { ThemeIcon } from "@/components/theme/ThemeDecor";

export const Route = createFileRoute("/stay/$token")({
  loader: ({ params }) => getStay({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: rebrand("Your guest guide — Latchkey") },
      { name: "description", content: "Your private step-by-step guide for your stay." },
      { property: "og:title", content: rebrand("Your guest guide — Latchkey") },
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
  return key === "today" ? CalendarX : sectionIcon(key);
}

function Stay() {
  const s = Route.useLoaderData();
  const { token } = Route.useParams();
  useEffect(() => {
    if (s.found) rememberStay(s.propertyId, token, s.checkOutDate);
  }, [s, token]);
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
  return <StayPage s={s} token={token} theme={s.theme} />;
}

type StayData = Extract<Awaited<ReturnType<typeof getStay>>, { found: true }>;

/** Jumps to a part of the guide (a section on the reminder card is found there). */
function jumpTo(id: string) {
  window.setTimeout(() => (document.getElementById(id) ?? (id.startsWith("guide-") ? document.getElementById("forget") : null))?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

function StayPage({ s, token, theme }: { s: StayData; token: string; theme: StayData["theme"] }) {
  const p = s.property;
  const [open, setOpen] = useState<string[]>([s.guide[0]?.key ?? ""]);
  // Quick ways in, in the theme's icon style: the host's chosen tiles, or Wi-Fi, the first guide sections, extras and messages.
  const tiles = shownTiles(
    s.tiles.tiles,
    { page: "stay", sections: [...s.guide, ...s.pinnedSections].map((g) => ({ key: g.key, title: g.title })), hasWifi: !!p?.wifi_name, canOrder: !s.readOnly },
    { wifi: copy.stayNetwork, extras: gcopy.quickExtras, messages: stayHeroCopy.messageTile, times: stayHeroCopy.tileTimes },
  );
  return (
    <GuestFrame theme={s.theme} name={p?.name ?? undefined}>
      <main className="mx-auto max-w-4xl space-y-6 py-6 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {theme.eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent">{theme.eyebrow}</p> : null}
            <h1 className="text-3xl sm:text-5xl">{copy.stayTitle(s.firstName)}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {s.room ? copy.roomLine(s.room.display_name, s.room.public_title) : p?.name}
            </p>
            {theme.welcomeBody ? <p className="mt-1 text-base text-muted-foreground">{theme.welcomeBody.replace("{property}", p?.name ?? "")}</p> : null}
          </div>
          <StayInbox token={token} />
        </div>

        <GuideTiles
          theme={theme}
          label={gcopy.quickTitle}
          tiles={tiles}
          stored={s.tiles.tiles}
          files={s.tiles.files}
          onAction={(a) => {
            if (a.kind === "messages") return openStayInbox();
            if (a.kind === "extras") return jumpTo("stay-extras");
            if (a.kind === "jump") {
              if (a.section) setOpen((o) => (o.includes(a.section!) ? o : [...o, a.section!]));
              jumpTo(a.target);
            }
          }}
        />

        {/* The cover photo with the extras invitation, the stay at a glance, and help: in every template's own look. */}
        <StayCover theme={theme} name={p?.name ?? ""} photo={s.roomPhoto} extras={!s.readOnly} onExtras={() => jumpTo("stay-extras")} />
        <div id="stay-times" className="scroll-mt-6">
        <StaySummary
          theme={theme}
          checkInDate={s.checkInDate}
          checkInTime={s.checkInTime}
          checkOutDate={s.checkOutDate}
          checkOutTime={s.checkOutTime}
          wifi={p?.wifi_name ?? null}
          room={s.room ? { name: s.room.display_name, title: s.room.public_title } : null}
        />
        </div>
        {s.readOnly ? null : <StayHelp theme={theme} onMessage={openStayInbox} />}


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
          <section id="stay-wifi" className="card-soft flex scroll-mt-6 flex-wrap items-center gap-3 p-5">
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

        <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-3">
          {s.guide.map((sec) => {
            const Icon = sectionIcon(sec.key);
            return (
              <AccordionItem key={sec.key} id={`guide-${sec.key}`} value={sec.key} className="card-soft scroll-mt-6 border-0 px-5">
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
                  <GuideAttachments items={(sec as { attachments?: Attachment[] }).attachments} />
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

        {s.readOnly ? <p className="card-soft p-5 text-lg">{gcopy.readOnly}</p> : (<><div id="stay-extras" className="scroll-mt-6"><StayExtras token={token} /></div><StayServices token={token} /></>)}
        <StayInvoice token={token} place={p?.name ?? ""} />
        <StayReview token={token} />
      </main>
    </GuestFrame>
  );
}
