/**
 * Booking-site emails a host forwards to Latchkey (Airbnb, Booking.com and
 * others): which business it's for, which platform, the guest, the
 * reservation, the message itself and the address that replies reach the
 * guest through. Also Gmail's "confirm forwarding" email, so the host can
 * finish setting up from Latchkey. Pure, tested.
 */

export type InboundEmail = {
  /** Envelope recipients: the forwarding address, e.g. abc+<code>@inbound.postmarkapp.com. */
  to: string[];
  from: string;
  replyTo: string | null;
  subject: string;
  text: string;
  html?: string | null;
  messageId?: string | null;
  /** Postmark's part after the +, when it gives one. */
  mailboxHash?: string | null;
};

export type Platform = "airbnb" | "booking_com" | "vrbo" | "expedia" | "other";

export type Parsed =
  | { kind: "forward_confirm"; provider: "gmail"; code: string | null; link: string | null }
  | {
      kind: "message" | "reservation" | "other";
      platform: Platform;
      guestName: string | null;
      reservationCode: string | null;
      replyTo: string | null;
      body: string;
    };

const CODE = /^[a-z0-9]{8,24}$/;

/** The business's code from the address the email was sent to. */
export function hostCode(email: Pick<InboundEmail, "to" | "mailboxHash">): string | null {
  const hash = email.mailboxHash?.trim().toLowerCase();
  if (hash && CODE.test(hash)) return hash;
  for (const addr of email.to) {
    const local = (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim().toLowerCase().split("@")[0] ?? "";
    const plus = local.split("+")[1];
    if (plus && CODE.test(plus)) return plus;
    if (CODE.test(local)) return local;
  }
  return null;
}

const addrOf = (s: string | null | undefined) =>
  s ? (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase() : "";

export function platformOf(from: string, replyTo: string | null, text: string): Platform {
  const hay = `${addrOf(from)} ${addrOf(replyTo)}`;
  if (/airbnb\./.test(hay)) return "airbnb";
  if (/booking\.com/.test(hay)) return "booking_com";
  if (/vrbo\.|homeaway\./.test(hay)) return "vrbo";
  if (/expedia/.test(hay)) return "expedia";
  // Forwarded by hand: the original sender is in the text.
  if (/From:.*airbnb\./i.test(text)) return "airbnb";
  if (/From:.*booking\.com/i.test(text)) return "booking_com";
  return "other";
}

/** Plain text from an HTML-only email, good enough to read a message. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STOP = [
  /^\s*On .{3,120} wrote:\s*$/m,
  /^-{2,}\s*(Original Message|Forwarded message)/im,
  /^\s*(Reply|Respond|Send a message|Go to message|View message|Reply to .{1,40})\s*$/im,
  /^\s*(Airbnb, Inc\.|Airbnb Ireland|Booking\.com B\.V\.|Get the Airbnb app|Download the app|Unsubscribe|This email was sent|You're receiving this|Privacy Policy)/im,
];

/** The message itself: no quoted history, no footer, no forwarding header. */
export function messageBody(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  // Forwarded by hand: keep what's after the forwarded header block.
  const fwd = /-{5,}\s*Forwarded message\s*-{5,}[\s\S]*?\n\n/i.exec(t);
  if (fwd) t = t.slice(fwd.index + fwd[0].length);
  let cut = t.length;
  for (const re of STOP) {
    const m = re.exec(t);
    if (m && m.index > 0 && m.index < cut) cut = m.index;
  }
  return t
    .slice(0, cut)
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}

const clean = (name: string | null | undefined) => {
  const n = (name ?? "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  return n && n.length <= 80 && !/@|https?:/i.test(n) ? n : null;
};

export function guestNameFrom(subject: string, body: string): string | null {
  const s = subject.replace(/^((re|fw|fwd)\s*:\s*)+/i, "").trim();
  const patterns = [
    /^Reservation confirmed\s*[-–:]\s*(.+?)\s+arrives\b/i,
    /^(?:New message from|Message from(?: guest)?)\s+(.+?)(?:\s*[-–:|(]|$)/i,
    /^(.+?)\s+(?:sent you a message|has sent you a message|replied)\b/i,
    /^(?:Inquiry|Enquiry|Booking request) from\s+(.+?)(?:\s*[-–:|(]|$)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) return clean(m[1]);
  }
  const inBody = /Guest name:\s*([^\n]+)/i.exec(body) ?? /^(.+?)\s+sent you a message/im.exec(body);
  return inBody ? clean(inBody[1]) : null;
}

export function reservationCodeFrom(
  platform: Platform,
  subject: string,
  body: string,
): string | null {
  const hay = `${subject}\n${body}`;
  if (platform === "airbnb") return /\bHM[A-Z0-9]{8}\b/.exec(hay)?.[0] ?? null;
  const n =
    /(?:booking|reservation|confirmation)\s*(?:number|no\.?|id|#)?\s*[:#]?\s*([0-9]{9,12})\b/i.exec(
      hay,
    );
  return n?.[1] ?? null;
}

export function parseInbound(email: InboundEmail): Parsed {
  const from = addrOf(email.from);
  const text = email.text?.trim() ? email.text : htmlToText(email.html ?? "");
  if (
    /forwarding-noreply@google\.com/.test(from) ||
    /Gmail Forwarding Confirmation/i.test(email.subject)
  ) {
    return {
      kind: "forward_confirm",
      provider: "gmail",
      code:
        /Confirmation code:\s*(\d{6,12})/i.exec(text)?.[1] ??
        /\(#(\d{6,12})\)/.exec(email.subject)?.[1] ??
        null,
      link: /(https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"]+)/.exec(text)?.[1] ?? null,
    };
  }
  const platform = platformOf(email.from, email.replyTo, text);
  const body = messageBody(text);
  const subject = email.subject ?? "";
  const reservation = /reservation confirmed|new booking|booking confirmed|instant book/i.test(
    subject,
  );
  const message =
    /message|inquiry|enquiry|sent you|replied/i.test(subject) ||
    !!email.replyTo?.match(/reply\.airbnb|guest\.booking\.com|mchat\.booking\.com/i);
  return {
    kind: message ? "message" : reservation ? "reservation" : "other",
    platform,
    guestName: guestNameFrom(subject, body),
    reservationCode: reservationCodeFrom(platform, subject, `${body}\n${text}`),
    // Replies only reach the guest through the platform's relay address.
    replyTo: email.replyTo && platform !== "other" ? addrOf(email.replyTo) : null,
    body,
  };
}

/**
 * Which stay a message belongs to: the reservation code if it's known,
 * otherwise the guest's name on a stay from that platform around now.
 */
export function matchStay<
  B extends {
    id: string;
    channel: string;
    reservation_code: string | null;
    guest_full_name: string | null;
    check_in_date: string;
    check_out_date: string;
  },
>(
  parsed: { platform: Platform; reservationCode: string | null; guestName: string | null },
  stays: B[],
  today: string,
): B | null {
  if (parsed.reservationCode) {
    const byCode = stays.find(
      (s) => s.reservation_code?.toUpperCase() === parsed.reservationCode!.toUpperCase(),
    );
    if (byCode) return byCode;
  }
  if (!parsed.guestName) return null;
  const first = parsed.guestName.toLowerCase().split(" ")[0]!;
  const near = stays
    .filter(
      (s) =>
        (parsed.platform === "other" || s.channel === parsed.platform) &&
        s.check_out_date >= shift(today, -3) &&
        s.check_in_date <= shift(today, 120),
    )
    .filter((s) => (s.guest_full_name ?? "").toLowerCase().split(" ")[0] === first);
  // Only when it's clear which one: two Sams on Airbnb is a guess, so leave it.
  return near.length === 1 ? near[0]! : null;
}

function shift(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
