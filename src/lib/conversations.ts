/**
 * The in-house conversation with each guest: messages, extras requests
 * (approve, pay, deliver) and service requests, all recorded with the stay.
 * This works out what each stay is waiting on, for Today. Pure, tested.
 */

export type Msg = { direction: "inbound" | "outbound" | string; created_at: string; read_by_host_at: string | null; read_by_guest_at: string | null; body: string | null };
export type Req = { id: string; status: string; total_pence: number; items: unknown; created_at: string };
export type Job = { id: string; status: string; title: string; created_at: string };

export type ChipKey = "unread" | "reply" | "approve" | "unpaid" | "deliver" | "jobs" | "unseen" | "sorted";
export type Chip = { key: ChipKey; count: number };

export type Conversation = {
  messages: number;
  lastBody: string | null;
  lastAt: string | null;
  lastFromGuest: boolean;
  chips: Chip[];
  /** Something here is waiting on the host. */
  needsHost: boolean;
  unpaidPence: number;
};

const OPEN_JOB = ["new", "acknowledged", "booked", "in_progress"];

export function summarise(msgs: Msg[], reqs: Req[], jobs: Job[]): Conversation {
  const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = sorted[sorted.length - 1];
  const unread = sorted.filter((m) => m.direction === "inbound" && !m.read_by_host_at).length;
  // The guest spoke last and the host has read it, but hasn't answered.
  const awaitingReply = !!last && last.direction === "inbound" && !!last.read_by_host_at;
  const unseen = sorted.filter((m) => m.direction === "outbound" && !m.read_by_guest_at).length;
  const approve = reqs.filter((r) => r.status === "requested" || r.status === "suggested").length;
  const unpaidList = reqs.filter((r) => r.status === "awaiting_payment");
  const deliver = reqs.filter((r) => r.status === "approved" || r.status === "confirmed").length;
  const openJobs = jobs.filter((j) => OPEN_JOB.includes(j.status)).length;

  const chips: Chip[] = [];
  if (unread) chips.push({ key: "unread", count: unread });
  if (awaitingReply) chips.push({ key: "reply", count: 1 });
  if (approve) chips.push({ key: "approve", count: approve });
  if (unpaidList.length) chips.push({ key: "unpaid", count: unpaidList.length });
  if (deliver) chips.push({ key: "deliver", count: deliver });
  if (openJobs) chips.push({ key: "jobs", count: openJobs });
  if (unseen) chips.push({ key: "unseen", count: unseen });
  const anything = sorted.length + reqs.length + jobs.length > 0;
  if (!chips.length && anything) chips.push({ key: "sorted", count: 0 });

  const lastActivity = [last?.created_at, ...reqs.map((r) => r.created_at), ...jobs.map((j) => j.created_at)].filter(Boolean).sort().pop() ?? null;
  return {
    messages: sorted.length,
    lastBody: last?.body ?? null,
    lastAt: lastActivity,
    lastFromGuest: last?.direction === "inbound",
    chips,
    needsHost: unread > 0 || awaitingReply || approve > 0 || deliver > 0 || openJobs > 0,
    unpaidPence: unpaidList.reduce((n, r) => n + (r.total_pence ?? 0), 0),
  };
}

/** Stays waiting on the host first, then the most recent. */
export function byAttention<T extends { conversation: Conversation }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.conversation.needsHost) - Number(a.conversation.needsHost) ||
      (b.conversation.lastAt ?? "").localeCompare(a.conversation.lastAt ?? ""),
  );
}

export type Scope = "now" | "upcoming" | "past";

/** Which list a stay belongs in, by its dates in the property's own day. */
export function scopeOf(b: { check_in_date: string; check_out_date: string }, today: string): Scope {
  if (b.check_out_date < today) return "past";
  if (b.check_in_date > today) return "upcoming";
  return "now";
}
