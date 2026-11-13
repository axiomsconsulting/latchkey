/**
 * Every outside key Latchkey uses, in one list (Latchkey admin → System → Keys and secrets).
 *
 * A key saved in Latchkey admin (platform_secrets "api_keys") wins over the same name in
 * Lovable Cloud → Secrets, and is picked up by the server within SECRETS_TTL_MS without
 * publishing again: the request middleware (start.ts) refreshes the cache below, and
 * secret(name) reads it synchronously anywhere on the server. In the browser secret() is
 * always null.
 *
 * Pure apart from secret(), so the catalogue, the checks and the masking are tested.
 */

export type SecretGroup =
  "ai" | "guide" | "messages" | "payments" | "google" | "site" | "signing" | "platform";

/** Where a key's value can be changed. */
export type SecretEdit =
  /** Saved in Latchkey admin (or Lovable Secrets as before). */
  | "app"
  /** Lovable Cloud → Secrets only, on purpose: changing it here could break existing data or move real money. */
  | "lovable"
  /** Provided by Lovable Cloud itself. */
  | "platform";

export type SecretDef = {
  name: string;
  label: string;
  group: SecretGroup;
  edit: SecretEdit;
  /** Shown masked (first and last few characters) until revealed. */
  confidential: boolean;
  /** Can the full value be shown to a super admin? Never for Lovable's own keys. */
  revealable: boolean;
  /** What it does in Latchkey. */
  used: string;
  /** How to get it, step by step. */
  steps: Array<{ text: string; href?: string }>;
  /** What a right value looks like. */
  looks: string;
  example?: string;
  /** A right value matches this (after trimming). */
  pattern?: RegExp;
  /** Said when the key changes: what else has to happen. */
  afterChange?: string;
  /** For yes/no switches. */
  choices?: string[];
};

export const SECRETS_TTL_MS = 30_000;

/** platform_secrets row holding the saved keys. */
export const SECRETS_ROW = "api_keys";

export const SECRET_GROUPS: Array<{ id: SecretGroup; label: string; hint: string }> = [
  { id: "ai", label: "AI and page reading", hint: "Reading listings, reviews and prices; voices." },
  { id: "guide", label: "Guest guide: what's on", hint: "Events near each property." },
  {
    id: "messages",
    label: "Alerts and messages",
    hint: "Texts, WhatsApp, Telegram, push, email in.",
  },
  { id: "payments", label: "Payments", hint: "Stripe for subscriptions and hosts' guests." },
  { id: "google", label: "Google Drive", hint: "Private records and guide attachments." },
  { id: "site", label: "Site", hint: "Web address and the recording account." },
  {
    id: "signing",
    label: "Signing and sealing",
    hint: "Kept in Lovable Secrets: changing one breaks links and sealed data already made.",
  },
  {
    id: "platform",
    label: "Provided by Lovable Cloud",
    hint: "Managed by Lovable; shown for reference.",
  },
];

const app = (d: Omit<SecretDef, "edit" | "revealable"> & { revealable?: boolean }): SecretDef => ({
  edit: "app",
  revealable: true,
  ...d,
});

export const SECRETS: SecretDef[] = [
  /* ------------------------------- AI ------------------------------- */
  app({
    name: "FIRECRAWL_API_KEY",
    label: "Firecrawl",
    group: "ai",
    confidential: true,
    used: "Reads public pages: listing import, door tablet reviews and smart pricing.",
    steps: [
      { text: "Sign in or sign up at firecrawl.dev.", href: "https://www.firecrawl.dev/app" },
      {
        text: "Open API Keys in the dashboard and copy the key.",
        href: "https://www.firecrawl.dev/app/api-keys",
      },
      { text: "Each page read uses credits from your Firecrawl plan." },
    ],
    looks: "Starts with fc- followed by letters and numbers.",
    example: "fc-0123456789abcdef0123456789abcdef",
    pattern: /^fc-[A-Za-z0-9]{16,}$/,
  }),
  app({
    name: "ELEVENLABS_API_KEY",
    label: "ElevenLabs",
    group: "ai",
    confidential: true,
    used: "Records the studio voices and listens on door tablets (speech to text).",
    steps: [
      { text: "Sign in at elevenlabs.io.", href: "https://elevenlabs.io/app" },
      {
        text: "Open Developers → API keys and create a key with Text to Speech, Speech to Text and Voices (read) allowed.",
        href: "https://elevenlabs.io/app/settings/api-keys",
      },
      { text: "Then pick the voices in Studio voices below." },
    ],
    looks: "Starts with sk_ followed by 48 letters and numbers.",
    example: "sk_0123456789abcdef0123456789abcdef0123456789abcdef",
    pattern: /^(sk_)?[A-Za-z0-9]{32,}$/,
  }),

  /* ------------------------------ Guide ----------------------------- */
  app({
    name: "SKIDDLE_API_KEY",
    label: "Skiddle (UK events)",
    group: "guide",
    confidential: true,
    used: "Gigs, theatre, comedy, festivals, family days and exhibitions near UK properties.",
    steps: [
      {
        text: "Apply for a free key with the Skiddle API form.",
        href: "https://www.skiddle.com/api/join.php",
      },
      { text: "Skiddle emails the key once they approve it (usually a few days)." },
      { text: "Paste the key exactly as emailed.", href: "https://github.com/Skiddle/web-api" },
    ],
    looks: "32 letters and numbers (0-9, a-f).",
    example: "0123456789abcdef0123456789abcdef",
    pattern: /^[A-Za-z0-9]{20,64}$/,
  }),
  app({
    name: "TICKETMASTER_API_KEY",
    label: "Ticketmaster",
    group: "guide",
    confidential: true,
    used: "Ticketed events near each property.",
    steps: [
      {
        text: "Create an account on the Ticketmaster developer portal.",
        href: "https://developer-acct.ticketmaster.com/user/register",
      },
      {
        text: "Open My Apps and copy the Consumer Key (not the Consumer Secret).",
        href: "https://developer-acct.ticketmaster.com/user/login",
      },
      { text: "New accounts can take a while to be activated." },
    ],
    looks: "32 letters and numbers: the Consumer Key.",
    example: "AbCdEfGhIjKlMnOpQrStUvWxYz012345",
    pattern: /^[A-Za-z0-9]{24,40}$/,
  }),

  /* ---------------------------- Messages ---------------------------- */
  app({
    name: "TWILIO_ACCOUNT_SID",
    label: "Twilio Account SID",
    group: "messages",
    confidential: false,
    used: "Texts and WhatsApp to guests and hosts.",
    steps: [
      { text: "Sign in to the Twilio Console.", href: "https://console.twilio.com/" },
      { text: "Copy Account SID from Account Info on the front page." },
    ],
    looks: "AC followed by 32 letters and numbers (0-9, a-f): 34 characters.",
    // Built from parts so secret scanners don't take the example for a real SID.
    example: "AC" + "0123456789abcdef".repeat(2),
    pattern: /^AC[0-9a-fA-F]{32}$/,
  }),
  app({
    name: "TWILIO_AUTH_TOKEN",
    label: "Twilio Auth Token",
    group: "messages",
    confidential: true,
    used: "Proves the texts come from your Twilio account.",
    steps: [
      {
        text: "In the Twilio Console, Account Info → Auth Token → Show, then copy.",
        href: "https://console.twilio.com/",
      },
      {
        text: "If you make a new token in Twilio, paste it here at once: the old one stops working.",
      },
    ],
    looks: "32 letters and numbers (0-9, a-f).",
    example: "0123456789abcdef0123456789abcdef",
    pattern: /^[0-9a-fA-F]{32}$/,
  }),
  app({
    name: "TWILIO_FROM",
    label: "Twilio sender (texts)",
    group: "messages",
    confidential: false,
    used: "The number texts come from, or a Messaging Service.",
    steps: [
      {
        text: "Twilio Console → Phone Numbers → Active numbers: copy the number with its country code.",
        href: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
      },
      { text: "Or Messaging → Services: copy the Messaging Service SID (MG…)." },
    ],
    looks: "A phone number in international form (+44…), or MG followed by 32 characters.",
    example: "+447700900123",
    pattern: /^(\+[1-9]\d{6,14}|MG[0-9a-fA-F]{32})$/,
  }),
  app({
    name: "TWILIO_WHATSAPP_FROM",
    label: "Twilio WhatsApp sender",
    group: "messages",
    confidential: false,
    used: "Latchkey's WhatsApp number, when WhatsApp settings don't name one.",
    steps: [
      {
        text: "Twilio Console → Messaging → Senders → WhatsApp senders: copy the approved number.",
        href: "https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders",
      },
      { text: "The WhatsApp card below can also set the sender; that one wins." },
    ],
    looks: "A phone number in international form, with or without whatsapp: in front.",
    example: "whatsapp:+447700900123",
    pattern: /^(whatsapp:)?\+[1-9]\d{6,14}$/,
  }),
  app({
    name: "TELEGRAM_BOT_TOKEN",
    label: "Telegram bot",
    group: "messages",
    confidential: true,
    used: "Host alerts by Telegram.",
    steps: [
      {
        text: "In Telegram, message @BotFather and send /newbot (or /token for an existing bot).",
        href: "https://t.me/BotFather",
      },
      { text: "Copy the token it sends." },
    ],
    looks: "Numbers, a colon, then about 35 letters, numbers, - and _.",
    example: "123456789:AAH0123456789abcdefghijklmnopqrstu",
    pattern: /^\d{6,12}:[A-Za-z0-9_-]{30,}$/,
    afterChange:
      "The bot's webhook address is made from the token: set the webhook again from Integrations, and hosts link the new bot again.",
  }),
  app({
    name: "VAPID_PUBLIC_KEY",
    label: "Push alerts: public key",
    group: "messages",
    confidential: false,
    used: "Phone and computer notifications for hosts (Web Push).",
    steps: [
      { text: "Make a pair once on a computer: npx web-push generate-vapid-keys" },
      { text: "Paste the Public Key here and the Private Key below. Always change both together." },
    ],
    looks: "About 87 letters, numbers, - and _, starting with B.",
    example:
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
    pattern: /^B[A-Za-z0-9_-]{80,90}$/,
    afterChange:
      "Existing devices stop getting alerts: each host turns alerts on again on their devices.",
  }),
  app({
    name: "VAPID_PRIVATE_KEY",
    label: "Push alerts: private key",
    group: "messages",
    confidential: true,
    used: "Signs each push alert. Must belong to the public key above.",
    steps: [
      {
        text: "The Private Key from the same npx web-push generate-vapid-keys run as the public key.",
      },
    ],
    looks: "43 letters, numbers, - and _.",
    example: "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls",
    pattern: /^[A-Za-z0-9_-]{42,44}$/,
    afterChange:
      "Existing devices stop getting alerts: each host turns alerts on again on their devices.",
  }),
  app({
    name: "VAPID_SUBJECT",
    label: "Push alerts: contact",
    group: "messages",
    confidential: false,
    used: "How push services can reach Latchkey about a problem.",
    steps: [{ text: "A mailto: address you read, or the site's https address." }],
    looks: "mailto: and an email address, or an https address.",
    example: "mailto:support@example.com",
    pattern: /^(mailto:[^@\s]+@[^@\s]+\.[^@\s]+|https:\/\/\S+)$/,
  }),
  app({
    name: "INBOUND_EMAIL_SECRET",
    label: "Inbound email webhook secret",
    group: "messages",
    confidential: true,
    used: "The private part of the address your email provider posts booking-site emails to.",
    steps: [
      {
        text: "Make up a long random string (32+ letters and numbers), for example from a password manager.",
      },
      {
        text: "Use it in the provider's webhook address: /api/public/inbound-email/<this secret>.",
      },
    ],
    looks: "At least 24 letters and numbers, no spaces or slashes.",
    pattern: /^[A-Za-z0-9_-]{24,}$/,
    afterChange:
      "Update the webhook address at your email provider (Postmark or the worker) straight away.",
  }),

  /* ---------------------------- Payments ---------------------------- */
  app({
    name: "STRIPE_SECRET_KEY",
    label: "Stripe live secret key",
    group: "payments",
    confidential: true,
    used: "Subscriptions, hosts' connected accounts and guests' card payments (live).",
    steps: [
      {
        text: "Stripe Dashboard (live mode) → Developers → API keys.",
        href: "https://dashboard.stripe.com/apikeys",
      },
      { text: "Copy the Secret key, or a Restricted key with the permissions Latchkey needs." },
    ],
    looks: "sk_live_ or rk_live_ followed by letters and numbers.",
    example: "sk_live_51Ab…",
    pattern: /^(sk|rk)_live_[A-Za-z0-9]{20,}$/,
    afterChange:
      "Only change it to a key from the same Stripe account, or hosts' connected accounts won't be found.",
  }),
  app({
    name: "STRIPE_LIVE_API_KEY",
    label: "Stripe live key (alternative name)",
    group: "payments",
    confidential: true,
    used: "Same as the live secret key; used first when both are set. Leave empty if you use the one above.",
    steps: [{ text: "Leave empty unless you set it before: STRIPE_SECRET_KEY is enough." }],
    looks: "sk_live_ or rk_live_ followed by letters and numbers.",
    pattern: /^(sk|rk)_live_[A-Za-z0-9]{20,}$/,
  }),
  app({
    name: "STRIPE_TEST_API_KEY",
    label: "Stripe test key",
    group: "payments",
    confidential: true,
    used: "Commission Partner payouts (test mode) and trying things without real money.",
    steps: [
      {
        text: "Stripe Dashboard → turn on Test mode → Developers → API keys.",
        href: "https://dashboard.stripe.com/test/apikeys",
      },
      { text: "Copy the test Secret key." },
    ],
    looks: "sk_test_ or rk_test_ followed by letters and numbers.",
    example: "sk_test_51Ab…",
    pattern: /^(sk|rk)_test_[A-Za-z0-9]{20,}$/,
  }),
  app({
    name: "STRIPE_WEBHOOK_SECRET",
    label: "Stripe webhook signing secret",
    group: "payments",
    confidential: true,
    used: "Checks that payment updates really come from Stripe.",
    steps: [
      {
        text: "Stripe Dashboard → Developers → Webhooks → the endpoint ending /api/public/stripe-webhook.",
        href: "https://dashboard.stripe.com/webhooks",
      },
      { text: "Signing secret → Reveal, then copy." },
    ],
    looks: "whsec_ followed by letters and numbers.",
    example: "whsec_0123456789abcdef…",
    pattern: /^whsec_[A-Za-z0-9]{24,}$/,
  }),
  app({
    name: "STRIPE_CONNECT_WEBHOOK_SECRET",
    label: "Stripe Connect webhook signing secret",
    group: "payments",
    confidential: true,
    used: "The same check for events from hosts' connected accounts (a second endpoint, if you made one).",
    steps: [
      {
        text: "Stripe Dashboard → Developers → Webhooks → the endpoint listening to Connected accounts.",
        href: "https://dashboard.stripe.com/webhooks",
      },
      { text: "Signing secret → Reveal, then copy." },
    ],
    looks: "whsec_ followed by letters and numbers.",
    pattern: /^whsec_[A-Za-z0-9]{24,}$/,
  }),
  {
    name: "PARTNER_PAYOUTS_ALLOW_LIVE",
    label: "Commission Partner live payouts",
    group: "payments",
    edit: "lovable",
    confidential: false,
    revealable: true,
    used: "Lets Commission Partner payouts use the live Stripe key. Never switchable from the app.",
    steps: [
      { text: "Lovable Cloud → Secrets, only when going live (docs/commission-partners.md)." },
    ],
    looks: "true, or not set.",
    choices: ["true"],
  },
  {
    name: "PARTNER_GLOBAL_PAYOUTS_ENABLED",
    label: "Global Payouts switch",
    group: "payments",
    edit: "lovable",
    confidential: false,
    revealable: true,
    used: "One of the three switches for Stripe Global Payouts.",
    steps: [{ text: "Lovable Cloud → Secrets." }],
    looks: "true, or not set.",
    choices: ["true"],
  },
  {
    name: "GLOBAL_PAYOUTS_FINANCIAL_ACCOUNT_ID",
    label: "Global Payouts financial account",
    group: "payments",
    edit: "lovable",
    confidential: false,
    revealable: true,
    used: "The Stripe financial account Global Payouts are sent from.",
    steps: [{ text: "Lovable Cloud → Secrets." }],
    looks: "fa_ followed by letters and numbers.",
    pattern: /^fa_[A-Za-z0-9]+$/,
  },

  /* ----------------------------- Google ----------------------------- */
  app({
    name: "GOOGLE_CLIENT_ID",
    label: "Google OAuth client ID",
    group: "google",
    confidential: false,
    used: "Connecting Latchkey's Google Drive (private records, guide attachments).",
    steps: [
      {
        text: "Google Cloud Console → APIs & Services → Credentials.",
        href: "https://console.cloud.google.com/apis/credentials",
      },
      {
        text: "Create credentials → OAuth client ID → Web application; add the redirect shown on the Drive card.",
      },
      {
        text: "The consent screen must be In production, or Google ends the connection after 7 days.",
      },
    ],
    looks: "Numbers and letters ending in .apps.googleusercontent.com.",
    example: "123456789012-abc123def456.apps.googleusercontent.com",
    pattern: /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
    afterChange: "Connect Google Drive again on the Drive card.",
  }),
  app({
    name: "GOOGLE_CLIENT_SECRET",
    label: "Google OAuth client secret",
    group: "google",
    confidential: true,
    used: "Belongs to the client ID above.",
    steps: [
      {
        text: "Same Credentials page → the OAuth client → Client secret.",
        href: "https://console.cloud.google.com/apis/credentials",
      },
    ],
    looks: "GOCSPX- followed by letters, numbers, - and _.",
    example: "GOCSPX-0123456789abcdefghijklmn",
    pattern: /^GOCSPX-[A-Za-z0-9_-]{20,}$/,
    afterChange: "Connect Google Drive again on the Drive card.",
  }),

  /* ------------------------------ Site ------------------------------ */
  app({
    name: "PUBLIC_SITE_URL",
    label: "Site address",
    group: "site",
    confidential: false,
    used: "Links in emails, texts, webhooks and the OpenStreetMap contact line.",
    steps: [{ text: "The live site's address as guests see it, https and no slash at the end." }],
    looks: "https:// and the domain, with no / at the end.",
    example: "https://latchkey.omsestates.uk",
    pattern: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i,
    afterChange:
      "SmartThings and Google redirects use it: check those cards if the domain changed.",
  }),
  app({
    name: "RECORDING_HOST_EMAIL",
    label: "Recording account email",
    group: "site",
    confidential: false,
    used: "The account Routines → Seed recording account fills with sample data.",
    steps: [
      { text: "Sign up that account first, then put its email here. Never the demo account's." },
    ],
    looks: "An email address.",
    pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  }),
  app({
    name: "RECORDING_BUSINESS_NAME",
    label: "Recording business name",
    group: "site",
    confidential: false,
    used: "The business name on the recording account.",
    steps: [{ text: "Any name; The Hill Suites when empty." }],
    looks: "A business name.",
  }),

  /* ----------------------------- Signing ---------------------------- */
  ...(
    [
      [
        "PRIVATE_FILE_SIGNING_SECRET",
        "Private file links",
        "Signs 10-minute links to ID photos and signed agreements; seals bank and smart home passwords.",
      ],
      [
        "ATTACHMENT_SIGNING_SECRET",
        "Attachment links",
        "Signs guide attachment links (and private files when the one above isn't set).",
      ],
      ["IP_HASH_SECRET", "Visit pepper", "Makes the one-day pseudonyms of visitors' connections."],
      [
        "PARTNER_IDENTITY_HASH_SECRET",
        "Partner identity hashes",
        "Hashes Commission Partners' identity details for fraud checks.",
      ],
    ] as const
  ).map(([name, label, used]): SecretDef => ({
    name,
    label,
    group: "signing",
    edit: "lovable",
    confidential: true,
    revealable: true,
    used,
    steps: [
      { text: "Lovable Cloud → Secrets. Keep a copy: it can't be got back from anywhere else." },
    ],
    looks: "A long random string (32+ characters).",
  })),

  /* ----------------------------- Platform --------------------------- */
  {
    name: "LOVABLE_API_KEY",
    label: "Lovable AI and email",
    group: "platform",
    edit: "platform",
    confidential: true,
    revealable: false,
    used: "AI (ID reading, receptionist, voice, plan reading) and emails. Credits come from the Lovable workspace.",
    steps: [
      {
        text: "Provided by Lovable Cloud; top up credits in Lovable → Workspace settings → Plans & credit usage.",
      },
    ],
    looks: "Set by Lovable.",
  },
  {
    name: "SUPABASE_URL",
    label: "Database address",
    group: "platform",
    edit: "platform",
    confidential: false,
    revealable: true,
    used: "Where the database is.",
    steps: [{ text: "Provided by Lovable Cloud." }],
    looks: "https://<project>.supabase.co",
  },
  {
    name: "SUPABASE_PUBLISHABLE_KEY",
    label: "Database public key",
    group: "platform",
    edit: "platform",
    confidential: false,
    revealable: true,
    used: "The browser's key (public by design; rules in the database protect the data).",
    steps: [{ text: "Provided by Lovable Cloud." }],
    looks: "Set by Lovable.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Database service key",
    group: "platform",
    edit: "platform",
    confidential: true,
    revealable: false,
    used: "The server's full access to the database. Never shown.",
    steps: [{ text: "Provided by Lovable Cloud." }],
    looks: "Set by Lovable.",
  },
  {
    name: "LOVABLE_SEND_URL",
    label: "Lovable email sender",
    group: "platform",
    edit: "platform",
    confidential: false,
    revealable: true,
    used: "Where emails are handed to Lovable's sender.",
    steps: [{ text: "Provided by Lovable Cloud." }],
    looks: "Set by Lovable.",
  },
];

export const SECRET_NAMES = new Set(SECRETS.map((s) => s.name));
export const secretDef = (name: string) => SECRETS.find((s) => s.name === name) ?? null;
export const editableInApp = (name: string) => secretDef(name)?.edit === "app";

/** Common paste mistakes taken off: spaces, quotes, a NAME= prefix, "Bearer ". */
export function tidySecret(name: string, raw: string): string {
  let v = raw.trim();
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  v = v.replace(/^bearer\s+/i, "");
  if (/^(["'`]).*\1$/.test(v)) v = v.slice(1, -1).trim();
  return v;
}

/** Why a value looks wrong for this key, or null. The admin may still save it anyway. */
export function secretProblem(name: string, value: string): string | null {
  const d = secretDef(name);
  if (!d) return "Latchkey doesn't use a key by that name.";
  const v = value.trim();
  if (!v) return null;
  if (/\s/.test(v)) return "It has a space or line break in it: copy it again without them.";
  if (d.choices && !d.choices.includes(v))
    return `Use ${d.choices.join(" or ")}, or leave it empty.`;
  if (name === "STRIPE_SECRET_KEY" || name === "STRIPE_LIVE_API_KEY") {
    if (/^(sk|rk)_test_/.test(v)) return "That's a test key: put it under Stripe test key.";
    if (/^pk_/.test(v)) return "That's the publishable key (pk_): use the secret key (sk_live_).";
  }
  if (name === "STRIPE_TEST_API_KEY") {
    if (/^(sk|rk)_live_/.test(v)) return "That's a live key: put it under Stripe live secret key.";
    if (/^pk_/.test(v)) return "That's the publishable key (pk_): use the secret key (sk_test_).";
  }
  if (name === "PUBLIC_SITE_URL" && v.endsWith("/")) return "Leave off the / at the end.";
  if (name === "GOOGLE_CLIENT_SECRET" && v.endsWith(".apps.googleusercontent.com"))
    return "That's the client ID: the secret starts with GOCSPX-.";
  if (d.pattern && !d.pattern.test(v)) return `Doesn't look right. ${d.looks}`;
  return null;
}

/** First and last few characters, the middle hidden; short values show only their length. */
export function maskSecret(value: string): string {
  const v = value;
  if (v.length <= 8) return "•".repeat(Math.max(v.length, 4));
  const show = v.length >= 24 ? 6 : 3;
  const tail = v.length >= 24 ? 4 : 2;
  return `${v.slice(0, show)}${"•".repeat(Math.min(12, v.length - show - tail))}${v.slice(-tail)}`;
}

/* ------------------------- reading at runtime ------------------------- */

type Cache = { values: Record<string, string>; at: number };
const KEY = "__latchkeySecrets";

function cache(): Cache | undefined {
  return (globalThis as unknown as Record<string, Cache | undefined>)[KEY];
}

/** Server: replace the saved keys (called by secrets.server.ts). */
export function setSavedSecrets(values: Record<string, string>): void {
  (globalThis as unknown as Record<string, Cache>)[KEY] = { values, at: Date.now() };
}

export function savedSecretsAge(): number {
  const c = cache();
  return c ? Date.now() - c.at : Infinity;
}

/** The value Latchkey uses: saved in Latchkey admin, else Lovable Secrets, else null. */
export function secret(name: string): string | null {
  const saved = cache()?.values[name];
  if (saved && saved.trim()) return saved.trim();
  const env = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return env && env.trim() ? env.trim() : null;
}
