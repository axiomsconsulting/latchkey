import { useEffect, useRef, useState } from "react";
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
}: {
  sections: Section[];
  open: string[];
  onOpenChange: (next: string[]) => void;
  /** The door details aren't open yet (shown instead of the text). */
  lockedText?: string | null;
}) {
  const [view, setView] = useState<GuideView>("list");
  useEffect(() => {
    try {
      setView(readGuideView(window.localStorage.getItem(GUIDE_VIEW_KEY)));
    } catch {
      // Private window: the list it is.
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
  // The attachments open in the large viewer: which section, and which one.
  const [viewing, setViewing] = useState<{ key: string; index: number } | null>(null);
  const viewingItems = sections.find((s) => s.key === viewing?.key)?.attachments ?? [];

  const parts = sections.map((sec) => {
    const locked = sec.summary === "DOOR_LOCKED";
    const { lead, rest } = locked
      ? { lead: lockedText ?? "", rest: "" }
      : splitLeadRich(sec.summary);
    return { sec, lead, rest, Icon: sectionIcon(sec.key) };
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
        </div>
      ) : (
        <GuideGallery parts={parts} onClip={(key) => setViewing({ key, index: 0 })} />
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
  onClip,
}: {
  parts: Array<{
    sec: Section;
    lead: string;
    rest: string;
    Icon: React.ComponentType<{ className?: string }>;
  }>;
  onClip: (key: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    const el = row.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2"
      >
        {parts.map(({ sec, lead, rest, Icon }) => (
          <section
            key={sec.key}
            id={`guide-${sec.key}`}
            className="card-soft flex max-h-[75dvh] w-[86%] shrink-0 snap-center flex-col overflow-hidden sm:w-[70%] lg:w-[48%]"
          >
            <header className="flex items-start gap-3 border-b border-border bg-secondary/60 px-5 py-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card text-primary">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="min-w-0 flex-1 self-center font-display text-xl">{sec.title}</h3>
              <ClipButton count={sec.attachments?.length ?? 0} onOpen={() => onClip(sec.key)} />
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-base">
              {lead ? (
                <p className="text-lg">
                  <RichLine text={lead} />
                </p>
              ) : null}
              <SectionBody sec={sec} rest={rest} />
              <GuideAttachments items={sec.attachments} large />
            </div>
          </section>
        ))}
      </div>
      {parts.length > 1 ? (
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
            {parts.map(({ sec }, i) => (
              <span
                key={sec.key}
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
            disabled={at >= parts.length - 1}
            onClick={() => go(Math.min(parts.length - 1, at + 1))}
            className="grid size-11 place-items-center rounded-full border border-border bg-card disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
