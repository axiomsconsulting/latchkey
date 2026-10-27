import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Eye, Lock, Megaphone, MessageSquareHeart, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { billingCopy, common, feedbackCopy, supportCopy } from "@/content/copy";
import { useWorkspace } from "@/hooks/use-host-data";
import {
  dismissAnnouncement,
  getSiteSettings,
  myAnnouncements,
  viewAsHost,
} from "@/lib/admin.functions";
import { formatUkDate } from "@/lib/dates";
import { sendFeedback } from "@/lib/feedback.functions";
import { cn } from "@/lib/utils";

/** Pages a host can still open after their access ends. */
const ALWAYS_OPEN = ["/app/billing", "/app/register"];

/**
 * Shows the page, or a lock screen when the trial or subscription has ended.
 * The database refuses changes either way; this explains why.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const d = ws.data;
  if (!d || d.access || d.support || d.isSuperAdmin || ALWAYS_OPEN.some((p) => path.startsWith(p)))
    return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <Lock className="mx-auto size-12 text-primary" />
      <h1 className="mt-4 text-3xl">{billingCopy.lockedTitle}</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {d.billingPhase === "canceled" ? billingCopy.lockedCanceled : billingCopy.lockedTrial}
      </p>
      <Button asChild size="lg" variant="accent" className="mt-8">
        <Link to="/app/billing">{billingCopy.lockedCta}</Link>
      </Button>
      <p className="mt-4 text-sm">
        <Link to="/app/register" className="underline underline-offset-4">
          {billingCopy.lockedRegister}
        </Link>
      </p>
    </div>
  );
}

/** Trial days left, a failed payment, a site notice, or support view. */
export function ShellBanners() {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const exit = useServerFn(viewAsHost);
  const fetchSite = useServerFn(getSiteSettings);
  const site = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => fetchSite(),
    staleTime: 10 * 60_000,
  });
  const d = ws.data;
  if (!d) return null;
  const banner =
    "mx-auto mb-4 flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-2xl p-3 text-sm print:hidden";

  return (
    <>
      {d.support ? (
        <div className={cn(banner, d.support.writable ? "bg-primary/10" : "bg-muted")}>
          <Eye className="size-4 shrink-0" />
          <span className="flex-1">
            {d.support.writable
              ? supportCopy.bannerWritable(
                  d.support.businessName,
                  formatUkDate((d.support.until ?? "").slice(0, 10), { withYear: true }),
                )
              : supportCopy.bannerReadOnly(d.support.businessName)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await exit({ data: { hostId: null } });
              await qc.invalidateQueries();
              await navigate({ to: "/app/admin" });
            }}
          >
            {supportCopy.exit}
          </Button>
        </div>
      ) : null}
      {site.data?.notice ? (
        <div className={cn(banner, "bg-secondary")}>
          <Megaphone className="size-4 shrink-0" />{" "}
          <span className="flex-1">{site.data.notice}</span>
        </div>
      ) : null}
      {!d.support && d.billingPhase === "past_due" ? (
        <div className={cn(banner, "bg-destructive/10")}>
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">{billingCopy.bannerPastDue}</span>
          <Button asChild size="sm" variant="outline">
            <Link to="/app/billing">{billingCopy.bannerCta}</Link>
          </Button>
        </div>
      ) : null}
      {!d.support &&
      d.billingPhase === "trial" &&
      d.trialDaysLeft !== null &&
      d.trialDaysLeft <= 7 ? (
        <div className={cn(banner, "bg-accent/10")}>
          <span className="flex-1">{billingCopy.bannerTrial(d.trialDaysLeft)}</span>
          <Button asChild size="sm" variant="outline">
            <Link to="/app/billing">{billingCopy.bannerCta}</Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Announcements and personal messages from Latchkey, each shown once until dismissed. */
export function AnnouncementPopup() {
  const fetchList = useServerFn(myAnnouncements);
  const dismiss = useServerFn(dismissAnnouncement);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["announcements"],
    queryFn: () => fetchList(),
    staleTime: 5 * 60_000,
  });
  const first = q.data?.[0];
  if (!first) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o)
          void dismiss({ data: { id: first.id } }).then(() =>
            qc.invalidateQueries({ queryKey: ["announcements"] }),
          );
      }}
    >
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Megaphone className="size-5 text-primary" /> {first.title}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line text-base text-foreground">
            {first.body}
          </DialogDescription>
        </DialogHeader>
        <Button
          onClick={() =>
            void dismiss({ data: { id: first.id } }).then(() =>
              qc.invalidateQueries({ queryKey: ["announcements"] }),
            )
          }
        >
          {feedbackCopy.gotIt}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Rate Latchkey, suggest a feature or report a bug. Goes to the Latchkey team. */
export function FeedbackButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={feedbackCopy.button}
        aria-label={feedbackCopy.button}
        className={cn(
          "spring flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
          compact && "justify-center",
          className,
        )}
      >
        <MessageSquareHeart className="size-5 shrink-0" />
        {compact ? null : <span>{feedbackCopy.button}</span>}
      </button>
      {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const send = useServerFn(sendFeedback);
  const ws = useWorkspace();
  const [tab, setTab] = useState<"host_rating" | "feature" | "bug">("host_rating");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (tab === "host_rating" ? rating === null && !message.trim() : !message.trim()) {
      toast.error(feedbackCopy.needSomething);
      return;
    }
    setBusy(true);
    try {
      await send({
        data: {
          kind: tab,
          rating: tab === "host_rating" ? rating : null,
          message: message.trim(),
          hostId: ws.data?.hostId || null,
          page: typeof window === "undefined" ? null : window.location.pathname.slice(0, 300),
        },
      });
      toast.success(feedbackCopy.thanks);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : common.errorBody);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{feedbackCopy.title}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-2xl p-1">
            <TabsTrigger value="host_rating" className="rounded-xl">
              {feedbackCopy.tabRate}
            </TabsTrigger>
            <TabsTrigger value="feature" className="rounded-xl">
              {feedbackCopy.tabFeature}
            </TabsTrigger>
            <TabsTrigger value="bug" className="rounded-xl">
              {feedbackCopy.tabBug}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="host_rating" className="mt-4 space-y-3">
            <p>{feedbackCopy.rateLabel}</p>
            <Stars value={rating} onChange={setRating} />
            <Textarea
              rows={3}
              placeholder={feedbackCopy.comment}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="feature" className="mt-4">
            <Textarea
              rows={5}
              placeholder={feedbackCopy.feature}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="bug" className="mt-4">
            <Textarea
              rows={5}
              placeholder={feedbackCopy.bug}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </TabsContent>
        </Tabs>
        <Button onClick={() => void submit()} disabled={busy}>
          {feedbackCopy.send}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Five tappable stars. */
export function Stars({
  value,
  onChange,
  size = "size-9",
}: {
  value: number | null;
  onChange?: (n: number) => void;
  size?: string;
}) {
  return (
    <div
      className="flex gap-1"
      role={onChange ? "radiogroup" : undefined}
      aria-label={value ? feedbackCopy.star(value) : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        const star = (
          <Star className={cn(size, on ? "fill-accent text-accent" : "text-muted-foreground/50")} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={feedbackCopy.star(n)}
            onClick={() => onChange(n)}
            className="rounded-lg p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}
