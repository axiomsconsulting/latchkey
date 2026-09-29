import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { guest as copy } from "@/content/copy";
import { getStayInbox, markGuestRead, sendGuestMessage } from "@/lib/messages.functions";
import { cn } from "@/lib/utils";

function when(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS: Record<string, string> = {
  requested: "Waiting for your host",
  awaiting_payment: "Waiting for payment",
  approved: "Agreed",
  confirmed: "Confirmed",
  declined: "Not possible",
  suggested: "Your host suggested another time",
  cancelled: "Cancelled",
  open: "Waiting for your host",
  scheduled: "Booked in",
  done: "Done",
};

export function StayInbox({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const load = useServerFn(getStayInbox);
  const send = useServerFn(sendGuestMessage);
  const read = useServerFn(markGuestRead);

  const q = useQuery({
    queryKey: ["stay-inbox", token],
    queryFn: () => load({ data: { token } }),
    refetchInterval: 45_000,
  });

  const post = useMutation({
    mutationFn: (body: string) => send({ data: { token, body } }),
    onSuccess: async () => {
      setDraft("");
      await qc.invalidateQueries({ queryKey: ["stay-inbox", token] });
    },
  });

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && (q.data?.unread ?? 0) > 0) {
      await read({ data: { token } });
      await qc.invalidateQueries({ queryKey: ["stay-inbox", token] });
    }
  }

  const unread = q.data?.unread ?? 0;
  const tz = q.data?.timezone ?? "Europe/London";
  const history = [...(q.data?.requests ?? []), ...(q.data?.jobs ?? [])].sort((a, b) =>
    b.when.localeCompare(a.when),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="lg" className="relative h-14 gap-2 rounded-full px-5" aria-label={copy.inboxOpen}>
          <MessageCircle className="size-5" />
          <span className="hidden sm:inline">{copy.inboxTitle}</span>
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {unread}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{copy.inboxTitle}</SheetTitle>
          <SheetDescription>{q.data?.hostName ?? ""}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {q.isLoading ? (
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          ) : (q.data?.messages.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">{copy.inboxEmpty}</p>
          ) : (
            q.data?.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-base",
                  m.fromHost ? "bg-secondary" : "ml-auto bg-primary text-primary-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={cn("mt-1 text-xs", m.fromHost ? "text-muted-foreground" : "opacity-80")}>
                  {m.fromHost ? copy.inboxHost : copy.inboxYou} · {when(m.createdAt, tz)}
                </p>
              </div>
            ))
          )}

          <section className="pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {copy.inboxHistory}
            </h3>
            {history.length === 0 ? (
              <p className="mt-2 text-muted-foreground">{copy.inboxHistoryEmpty}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-xl border bg-card px-3 py-2">
                    <p className="text-base">{h.label || "Request"}</p>
                    <p className="text-sm text-muted-foreground">
                      {STATUS[h.status] ?? h.status} · {when(h.when, tz)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <form
          className="flex items-end gap-2 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) post.mutate(draft.trim());
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={copy.inboxPlaceholder}
            aria-label={copy.inboxPlaceholder}
            rows={2}
            maxLength={1000}
            className="min-h-14 flex-1 text-base"
          />
          <Button type="submit" size="lg" className="h-14" disabled={!draft.trim() || post.isPending}>
            {post.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            <span className="sr-only">{copy.inboxSend}</span>
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
