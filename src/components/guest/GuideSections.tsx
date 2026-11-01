import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ExpandableText } from "@/components/guest/ExpandableText";
import { RichLine } from "@/components/RichText";
import { GuideAttachments, type Attachment } from "@/components/guest/GuideAttachments";
import { sectionIcon } from "@/components/guest/guide-icons";
import { guideCopy as gcopy } from "@/content/copy";
import { splitLeadRich } from "@/lib/guide-lead";
import { cn } from "@/lib/utils";

type Section = {
  key: string;
  title: string;
  summary: string | null;
  steps: Array<{ heading: string | null; body: string | null; imageUrl: string | null }>;
  attachments?: Attachment[];
};

/**
 * The guide's sections, shared by the stay guide and the room guide: each
 * heading shows the section's top line whether it's open or folded, the one
 * the guest is reading is highlighted, and the text is the same size as the
 * extras list. Opening follows the guest's scrolling (useScrollOpen); the
 * content doesn't animate, so the page can make up the height it changes.
 */
export function GuideSections({
  sections,
  open,
  onOpenChange,
  active,
  lockedText,
}: {
  sections: Section[];
  open: string[];
  onOpenChange: (next: string[]) => void;
  active: string | null;
  /** The door details aren't open yet (shown instead of the text). */
  lockedText?: string | null;
}) {
  return (
    <Accordion type="multiple" value={open} onValueChange={onOpenChange} className="space-y-3">
      {sections.map((sec) => {
        const Icon = sectionIcon(sec.key);
        const locked = sec.summary === "DOOR_LOCKED";
        const { lead, rest } = locked
          ? { lead: lockedText ?? "", rest: "" }
          : splitLeadRich(sec.summary);
        const isOpen = open.includes(sec.key);
        return (
          <AccordionItem
            key={sec.key}
            id={`guide-${sec.key}`}
            value={sec.key}
            data-scroll-open={sec.key}
            className={cn(
              "card-soft scroll-mt-6 border-0 px-5 transition-shadow",
              active === sec.key && "ring-2 ring-accent/60",
            )}
          >
            <AccordionTrigger className="min-h-16 items-start text-left hover:no-underline">
              <span className="flex min-w-0 items-start gap-3">
                <Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-display text-xl">{sec.title}</span>
                  {/* The top line, open or folded. */}
                  {lead ? (
                    <span
                      className={cn(
                        "mt-0.5 block font-sans text-base font-normal text-muted-foreground",
                        !isOpen && "line-clamp-1",
                      )}
                    >
                      <RichLine text={lead} />
                    </span>
                  ) : null}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent instant className="space-y-3 pb-5 text-base">
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
                          <ExpandableText
                            text={st.body}
                            className="text-sm text-muted-foreground"
                          />
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
              <GuideAttachments items={sec.attachments} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
