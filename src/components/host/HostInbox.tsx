import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { hostInbox as copy } from "@/content/copy";
import { getHostThread, listHostThreads, markHostRead, sendHostMessage } from "@/lib/messages.functions";
import { cn } from "@/lib/utils";

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function HostInbox({ propertyId, className }: { propertyId: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();

  const threadsFn = useServerFn(listHostThreads);
  const threadFn = useServerFn(getHostThread);
  const sendFn = useServerFn(sendHostMessage);
  const readFn = useServerFn(markHostRead);

  const threads = useQuery({
    queryKey: ["host-threads", propertyId],
    queryFn: () => threadsFn({ data: { propertyId: propertyId! } }),
    enabled: Boolean(propertyId),
    refetchInterval: 60_000,
  });

  const thread = useQuery({
    queryKey: ["host-thread", bookingId],
    queryFn: () => threadFn({ data: { bookingId: bookingId! } }),
    enabled: Boolean(bookingId),
    refetchInterval: 30_000,
  });

  const reply = useMutation({
    mutationFn: (body: string) => sendFn({ data: { bookingId: bookingId!, body } }),
    onSuccess: async () => {
      setDraft("");
      await qc.invalidateQueries({ queryKey: ["host-thread", bookingId] });
      await qc.invalidateQueries({ queryKey: ["host-threads", propertyId] });
    },
  });

  const unread = threads.data?.unread ?? 0;

  async function openThread(id: string) {
    setBookingId(id);
    await readFn({ data: { bookingId: id } });
    await qc.invalidateQueries({ queryKey: ["host-threads", propertyId] });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? (unread === 1 ? copy.unreadOne : copy.unreadMany(unread)) : copy.open}
          className={cn("relative grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground", className)}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{copy.title}</SheetTitle>
        </SheetHeader>

        {!bookingId ? (
          <div className="flex-1 overflow-y-auto p-4">
            {threads.isLoading ? (
              <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
            ) : (threads.data?.threads.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">{copy.empty}</p>
            ) : (
              <ul className="space-y-2">
                {threads.data?.threads.map((t) => (
                  <li key={t.bookingId}>
                    <button
                      type="button"
                      onClick={() => void openThread(t.bookingId)}
                      className="w-full rounded-2xl border bg-card px-4 py-3 text-left hover:bg-secondary"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {t.guest}
                          {t.room ? <span className="text-muted-foreground"> · {t.room}</span> : null}
                        </span>
                        {t.unread > 0 ? (
                          <span className="rounded-full bg-destructive px-2 text-xs text-destructive-foreground">
                            {t.unread}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">{t.lastBody}</span>
                      {t.lastAt ? <span className="block text-xs text-muted-foreground">{when(t.lastAt)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="border-b px-4 pb-3">
              <Button variant="ghost" size="sm" onClick={() => setBookingId(null)}>
                <ArrowLeft className="size-4" /> {copy.back}
              </Button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {thread.isLoading ? (
                <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
              ) : (
                thread.data?.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                      m.fromHost ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={cn("mt-1 text-xs", m.fromHost ? "opacity-80" : "text-muted-foreground")}>
                      {when(m.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <form
              className="flex items-end gap-2 border-t p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) reply.mutate(draft.trim());
              }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={copy.placeholder}
                aria-label={copy.placeholder}
                rows={2}
                maxLength={1000}
                className="min-h-12 flex-1"
              />
              <Button type="submit" disabled={!draft.trim() || reply.isPending}>
                {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                <span className="sr-only">{copy.send}</span>
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
