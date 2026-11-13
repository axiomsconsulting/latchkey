import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GalleryHorizontal, List, Paperclip } from "lucide-react";

import { ExpandableText } from "@/components/guest/ExpandableText";
import { RichLine } from "@/components/RichText";
import {
  AttachmentViewer,
  GuideAttachments,
  type Attachment,
} from "@/components/guest/GuideAttachments";
import { sectionIcon } from "@/components/guest/guide-icons";
import { guideCopy as gcopy } from "@/content/copy";
import { splitLeadRich } from "@/lib/guide-lead";
import { GUIDE_VIEW_KEY, hasMore, readGuideView, type GuideView } from "@/lib/guide-view";
import { cn } from "@/lib/utils";

type Section = {
  key: string;
  title: string;
  summary: string | null;
  steps: Array<{ heading: string | null; body: string | null; imageUrl: string | null }>;
  attachments?: Attachment[];
};

/**
 * A card that isn't a guide section (property information, around here, finding your room):
 * its own title, icon, picture and body, shown in both views like the sections.
 */
export type ExtraCard = {
  key: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  image?: string | null;
  lead?: string | null;
  body: ReactNode;
  /** Before the guide's sections (default) or after them. */
  after?: boolean;
};

/** A section's picture for the gallery: its first step photo, else its first photo attachment. */
const coverOf = (sec: Section) =>
  sec.steps.find((s) => s.imageUrl)?.imageUrl ??
  sec.attachments?.find((a) => a.kind === "image")?.url ??
  null;

/**
 * The guide's sections, shared by the stay guide and the room guide, in the
 * guest's choice of view (remembered on their device):
 * - List: one card per section showing its top line and "…"; a tap opens or
 *   closes it. Nothing opens or closes by itself as the page scrolls.
 * - Gallery: whole cards side by side, swiped through, with attachments as
 *   large thumbnails at the end of each card.
 * A clip opens a section's attachments in the large viewer either way.
 */
export function GuideSections({
  sections,
  open,
  onOpenChange,
  lockedText,
  extras = [],
  art,
}: {
  sections: Section[];
  extras?: ExtraCard[];
  /** The light picture behind each gallery card, by key (guide-art.ts), or none. */
  art?: (key: string) => string | null;
  open: string[];
  onOpenChange: (next: string[]) => void;
  /** The door details aren't open yet (shown instead of the text). */
  lockedText?: string | null;
}) {
  const [view, setView] = useState<GuideView>("gallery");
  useEffect(() => {
    try {
      setView(readGuideView(window.localStorage.getItem(GUIDE_VIEW_KEY)));
    } catch {
      // Private window: the gallery it is.
    }
  }, []);
  const choose = (v: GuideView) => {
    setView(v);
    try {
      window.localStorage.setItem(GUIDE_VIEW_KEY, v);
    } catch {
      // As above.
    }
  };
  // The receptionist can open a card for the guest (Receptionist.tsx OPEN_GUIDE_EVENT).
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onOpen = (e: Event) => {
      const key = String((e as CustomEvent).detail ?? "");
      if (!key) return;
      if (!openRef.current.includes(key)) onOpenChange([...openRef.current, key]);
      setTimeout(
        () =>
          document
            .getElementById(`guide-${key}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start", inline: "center" }),
        80,
      );
    };
    window.addEventListener("lk-open-guide", onOpen);
    return () => window.removeEventListener("lk-open-guide", onOpen);
  }, [onOpenChange]);
  // The attachments open in the large viewer: which section, and which one.
  const [viewing, setViewing] = useState<{ key: string; index: number } | null>(null);
  const viewingItems = sections.find((s) => s.key === viewing?.key)?.attachments ?? [];

  const parts = sections.map((sec) => {
    const locked = sec.summary === "DOOR_LOCKED";
    const { lead, rest } = locked
      ? { lead: lockedText ?? "", rest: "" }
      : splitLeadRich(sec.summary);
    return { sec, lead, rest, Icon: sectionIcon(sec.key), cover: coverOf(sec) };
  });
  const before = extras.filter((x) => !x.after);
  const later = extras.filter((x) => x.after);
  const extraList = (list: ExtraCard[]) =>
    list.map((x) => {
      const isOpen = open.includes(x.key);
      const toggle = () =>
        onOpenChange(isOpen ? open.filter((k) => k !== x.key) : [...open, x.key]);
      return (
        <section key={x.key} id={`guide-${x.key}`} className="card-soft scroll-mt-6 px-5">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={toggle}
            className="flex min-h-16 w-full min-w-0 items-start gap-3 py-4 text-left"
          >
            <x.Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block font-display text-xl">{x.title}</span>
              {x.lead ? (
                <span className="mt-0.5 block text-base text-muted-foreground">
                  <span className={cn(!isOpen && "line-clamp-1")}>{x.lead}</span>
                  {!isOpen ? (
                    <span className="font-semibold text-foreground" aria-hidden>
                      {" "}
                      …
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </button>
          {isOpen ? <div className="space-y-3 pb-5 text-base">{x.body}</div> : null}
        </section>
      );
    });

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-1" role="radiogroup" aria-label={gcopy.viewLabel}>
        {(
          [
            ["list", List, gcopy.viewList],
            ["gallery", GalleryHorizontal, gcopy.viewGallery],
          ] as const
        ).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            aria-label={label}
            title={label}
            onClick={() => choose(v)}
            className={cn(
              "grid size-11 place-items-center rounded-xl border transition-colors",
              view === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </button>
        ))}
      </div>

      {view === "list" ? (
        <div className="space-y-3">
          {extraList(before)}
          {parts.map(({ sec, lead, rest, Icon }) => {
            const isOpen = open.includes(sec.key);
            const more = hasMore({
              rest,
              steps: sec.steps.length,
              attachments: sec.attachments?.length ?? 0,
            });
            const toggle = () =>
              onOpenChange(isOpen ? open.filter((k) => k !== sec.key) : [...open, sec.key]);
            return (
              <section key={sec.key} id={`guide-${sec.key}`} className="card-soft scroll-mt-6 px-5">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-expanded={more ? isOpen : undefined}
                    onClick={more ? toggle : undefined}
                    className="flex min-h-16 min-w-0 flex-1 items-start gap-3 py-4 text-left"
                  >
                    <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-display text-xl">{sec.title}</span>
                      {lead || (more && !isOpen) ? (
                        <span className="mt-0.5 block text-base text-muted-foreground">
                          {lead ? (
                            <span className={cn(!isOpen && "line-clamp-1")}>
                              <RichLine text={lead} />
                            </span>
                          ) : null}
                          {more && !isOpen ? (
                            <span className="font-semibold text-foreground" aria-hidden>
                              {" "}
                              …
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <ClipButton
                    count={sec.attachments?.length ?? 0}
                    onOpen={() => setViewing({ key: sec.key, index: 0 })}
                  />
                </div>
                {isOpen && more ? (
                  <div className="space-y-3 pb-5 text-base">
                    <SectionBody sec={sec} rest={rest} />
                    <GuideAttachments items={sec.attachments} />
                  </div>
                ) : null}
              </section>
            );
          })}
          {extraList(later)}
        </div>
      ) : (
        <GuideGallery
          parts={parts}
          before={before}
          after={later}
          art={art}
          onClip={(key) => setViewing({ key, index: 0 })}
        />
      )}

      <AttachmentViewer
        items={viewingItems}
        index={viewing && viewingItems.length ? viewing.index : null}
        onIndex={(i) => setViewing(i === null || !viewing ? null : { key: viewing.key, index: i })}
      />
    </div>
  );
}

/** A clip with how many attachments the section has; opens the large viewer at the first. */
function ClipButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={gcopy.attachmentsOpen(count)}
      title={gcopy.attachmentsOpen(count)}
      className="mt-3 flex h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm text-primary hover:bg-secondary"
    >
      <Paperclip className="size-4" aria-hidden />
      {count > 1 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}

/** A section's text after its top line, and its numbered steps. */
function SectionBody({ sec, rest }: { sec: Section; rest: string }) {
  return (
    <>
      {rest ? <ExpandableText text={rest} className="text-base" /> : null}
      {sec.steps.length ? (
        <ol className="space-y-3">
          {sec.steps.map((st, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                {st.heading ? <p className="font-medium">{st.heading}</p> : null}
                {st.body ? (
                  <ExpandableText text={st.body} className="text-sm text-muted-foreground" />
                ) : null}
                {st.imageUrl ? (
                  <img
                    src={st.imageUrl}
                    alt={gcopy.photoAlt(st.heading || sec.title)}
                    loading="lazy"
                    className="max-h-80 w-full rounded-2xl object-cover"
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

/**
 * Gallery: every section as a whole card in a row that snaps one card at a
 * time, swiped on a phone or moved with the arrows; dots say where you are.
 * Each card's attachments sit at its end as large thumbnails, in their own
 * sideways row when there are several.
 */
function GuideGallery({
  parts,
  before,
  after,
  art,
  onClip,
}: {
  art?: ((key: string) => string | null) | undefined;
  parts: Array<{
    sec: Section;
    lead: string;
    rest: string;
    Icon: React.ComponentType<{ className?: string }>;
    cover: string | null;
  }>;
  before: ExtraCard[];
  after: ExtraCard[];
  onClip: (key: string) => void;
}) {
  const cards: Array<{
    key: string;
    title: string;
    Icon: React.ComponentType<{ className?: string }>;
    image: string | null;
    clip: number;
    body: ReactNode;
  }> = [
    ...before.map((x) => ({
      key: x.key,
      title: x.title,
      Icon: x.Icon,
      image: x.image ?? null,
      clip: 0,
      body: x.body,
    })),
    ...parts.map(({ sec, lead, rest, Icon, cover }) => ({
      key: sec.key,
      title: sec.title,
      Icon,
      image: cover,
      clip: sec.attachments?.length ?? 0,
      body: (
        <>
          {lead ? (
            <p className="font-medium">
              <RichLine text={lead} />
            </p>
          ) : null}
          <SectionBody sec={sec} rest={rest} />
          <GuideAttachments items={sec.attachments} large />
        </>
      ),
    })),
    ...after.map((x) => ({
      key: x.key,
      title: x.title,
      Icon: x.Icon,
      image: x.image ?? null,
      clip: 0,
      body: x.body,
    })),
  ];
  const row = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    const el = row.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };
  return (
    <div className="space-y-3">
      <div
        ref={row}
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
          setAt(Math.round(el.scrollLeft / Math.max(1, w + 12)));
        }}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {cards.map((c) => {
          // A faint picture behind the whole card (the host's for this section, else a starting one).
          const bg = art?.(c.key) ?? null;
          return (
            <section
              key={c.key}
              id={`guide-${c.key}`}
              className="card-soft relative isolate flex max-h-[62dvh] w-[calc(50%-0.375rem)] shrink-0 snap-start flex-col overflow-hidden lg:w-[calc(33.333%-0.5rem)]"
            >
              {bg ? (
                <img
                  src={bg}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="pointer-events-none absolute inset-0 -z-10 size-full object-cover"
                  style={{ opacity: 0.16 }}
                />
              ) : null}
              <header className="flex items-center gap-2 px-3 pb-1.5 pt-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
                  <c.Icon className="size-4" aria-hidden />
                </span>
                <h3 className="line-clamp-2 min-w-0 flex-1 font-display text-base leading-tight">
                  {c.title}
                </h3>
                {c.clip ? <ClipButton count={c.clip} onOpen={() => onClip(c.key)} /> : null}
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 text-sm">
                {c.body}
              </div>
            </section>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label={gcopy.galleryPrev}
            disabled={at <= 0}
            onClick={() => go(Math.max(0, at - 1))}
            className="grid size-11 place-items-center rounded-full border border-border bg-card disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex flex-wrap justify-center gap-1.5" aria-hidden>
            {cards.map((c, i) => (
              <span
                key={c.key}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  i === at ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={gcopy.galleryNext}
            disabled={at >= cards.length - 1}
            onClick={() => go(Math.min(cards.length - 1, at + 1))}
            className="grid size-11 place-items-center rounded-full border border-border bg-card disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
