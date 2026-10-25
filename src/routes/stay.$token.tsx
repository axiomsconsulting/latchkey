import { useEffect, useState } from "react";
import { GuestDemoDock } from "@/components/DemoDock";
import { GuideAttachments, type Attachment } from "@/components/guest/GuideAttachments";
import { createFileRoute } from "@tanstack/react-router";
import { rememberStay } from "@/lib/stay-link";
import { CalendarX, Check, KeyRound, Moon, X } from "lucide-react";

import { GuestFrame, GuestMessage } from "@/components/guest/GuestFrame";
import { ExpandableText } from "@/components/guest/ExpandableText";
import { StayExtras } from "@/components/guest/StayExtras";
import { StayInbox, openStayInbox } from "@/components/guest/StayInbox";
import { GuideTiles, StayCover, StayHelp, StaySummary } from "@/components/guest/StayHero";
import { shownTiles } from "@/lib/guide-tiles";
import { cn } from "@/lib/utils";
import { StayInvoice } from "@/components/guest/StayInvoice";
import { StayReview } from "@/components/guest/StayReview";
import { StayAgain } from "@/components/guest/StayAgain";
import { StayServices } from "@/components/guest/StayServices";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { sectionIcon } from "@/components/guest/guide-icons";
import { guideCopy as gcopy, guest as copy, stayHeroCopy } from "@/content/copy";
import { getStay } from "@/lib/checkin.functions";
import { rebrand } from "@/lib/brand";
import { ThemeIcon } from "@/components/theme/ThemeDecor";
import { WifiCard } from "@/components/guest/WifiCard";
import { ReviewNudge } from "@/components/guest/ReviewNudge";
import { reviewDay } from "@/lib/stay-access";
import { Button } from "@/components/ui/button";
import { stayProgressCopy as pcopy } from "@/content/copy";
import { formatUkDate } from "@/lib/dates";

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
    { page: "stay", sections: [...s.guide, ...s.pinnedSections].map((g) => ({ key: g.key, title: g.title })), hasWifi: !!s.wifi, canOrder: !s.readOnly },
    { wifi: copy.stayNetwork, extras: gcopy.quickExtras, messages: stayHeroCopy.messageTile, times: stayHeroCopy.tileTimes },
  );
  return (
    <GuestFrame theme={s.theme} name={p?.name ?? undefined}>
      <GuestDemoDock code={s.demoCode} />
      <main className={cn("mx-auto max-w-4xl space-y-6 py-6 sm:py-8", !s.checkedIn && !s.readOnly && "pb-32")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {theme.eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent">{theme.eyebrow}</p> : null}
            <h1 className="text-3xl sm:text-5xl">{copy.stayTitle(s.firstName)}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {s.room ? copy.roomLine(s.room.display_name, s.room.public_title) : p?.name}
            </p>
            {theme.welcomeBody ? <p className="mt-1 text-base text-muted-foreground">{theme.welcomeBody.replace("{property}", p?.name ?? "")}</p> : null}
            <StayProgressLine s={s} />
          </div>
          <StayInbox token={token} />
        </div>

        {/* The last day: a gentle ask for a review, where they booked (or here, for a direct stay). */}
        {s.review && reviewDay(s.progress.phase) ? <ReviewNudge token={token} ask={s.review} place={p?.name ?? ""} /> : null}

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
          wifi={null}
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

        {s.wifi ? <WifiCard id="stay-wifi" wifi={s.wifi} profileUrl={`/api/public/wifi/stay/${token}`} checkInHref={`/kiosk/${p?.short_code ?? ""}?guest=1`} /> : null}

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
        {/* A direct guest asked on the last day reviews there; otherwise the private note to the host stays here. */}
        {s.review?.direct && reviewDay(s.progress.phase) ? null : <StayReview token={token} />}
        {s.readOnly ? null : <StayAgain token={token} />}
      </main>
      {!s.checkedIn && !s.readOnly && p?.short_code ? <CheckInNudge href={`/kiosk/${p.short_code}?guest=1`} /> : null}
    </GuestFrame>
  );
}

/** Their dates and nights, and from the second day where they are in the stay with the host's message. */
function StayProgressLine({ s }: { s: StayData }) {
  const pr = s.progress;
  const line =
    pr.phase === "before" ? pcopy.before(pr.nights) : pr.phase === "arrival" ? pcopy.arrival(pr.nights) : pr.phase === "during" ? pcopy.during(pr.night, pr.nights, pr.left) : pr.phase === "leaving" ? pcopy.leaving : null;
  return (
    <div className="mt-3 space-y-1">
      <p className="flex flex-wrap items-center gap-x-2 text-base">
        <Moon className="size-4 text-accent" aria-hidden />
        <span className="font-medium">{pcopy.dates(formatUkDate(s.checkInDate), formatUkDate(s.checkOutDate))}</span>
        {line ? <span className="text-muted-foreground">· {line}</span> : null}
      </p>
      {pr.phase === "during" ? <p className="text-base text-muted-foreground">{s.stayMessage}</p> : null}
    </div>
  );
}

/**
 * Until they've checked in: a banner along the bottom of the screen asking
 * them to finish (their guest register details), on every visit. "Later"
 * hides it until the page is opened again.
 */
function CheckInNudge({ href }: { href: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div role="region" aria-label={pcopy.nudgeTitle} className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg">
      <KeyRound className="size-6 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{pcopy.nudgeTitle}</span>
        <span className="block text-sm text-muted-foreground">{pcopy.nudgeBody}</span>
      </span>
      <Button asChild>
        <a href={href}>{pcopy.nudgeCta}</a>
      </Button>
      <button type="button" onClick={() => setHidden(true)} aria-label={pcopy.nudgeLater} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary">
        <X className="size-4" />
      </button>
    </div>
  );
}
