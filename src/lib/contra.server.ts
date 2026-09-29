/**
 * Contra connector. Demo mode uses sample freelancers and confirms bookings
 * instantly. Live mode calls the Contra API configured by CONTRA_API_KEY and
 * CONTRA_API_BASE_URL; without them it fails with a clear setup message.
 */

import { DEMO_PROVIDERS } from "./contra-demo";
import type { Mode } from "./integration-modes";
import type { Provider } from "./services";

export class ContraSetupError extends Error {}

function liveConfig() {
  const key = process.env["CONTRA_API_KEY"];
  const base = process.env["CONTRA_API_BASE_URL"];
  if (!key || !base) {
    throw new ContraSetupError("Live Contra isn't connected yet. Add your Contra API details, or switch Contra to demo mode.");
  }
  return { key, base: base.replace(/\/$/, "") };
}

export function contraLiveReady(): boolean {
  return Boolean(process.env["CONTRA_API_KEY"] && process.env["CONTRA_API_BASE_URL"]);
}

async function liveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { key, base } = liveConfig();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("Contra API error", res.status, await res.text().catch(() => ""));
    throw new Error("Contra didn't respond as expected. Please try again or use demo mode.");
  }
  return (await res.json()) as T;
}

export async function searchProviders(mode: Mode, category: string | null, near: string | null): Promise<Provider[]> {
  if (mode === "demo") {
    return category ? DEMO_PROVIDERS.filter((p) => p.categories.includes(category)) : DEMO_PROVIDERS;
  }
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (near) q.set("near", near);
  const out = await liveFetch<{ providers: Provider[] }>(`/providers?${q.toString()}`);
  return out.providers ?? [];
}

export type BookingResult = { ref: string; confirmedEtaIso: string; quotedPence: number };

export async function bookProvider(
  mode: Mode,
  input: { provider: Provider; category: string; title: string; note: string | null; etaIso: string; address: string | null },
): Promise<BookingResult> {
  if (mode === "demo") {
    return {
      ref: `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      confirmedEtaIso: input.etaIso,
      quotedPence: input.provider.ratePence,
    };
  }
  const out = await liveFetch<{ id: string; eta: string; price_pence: number }>(`/bookings`, {
    method: "POST",
    body: JSON.stringify({
      provider_id: input.provider.id,
      category: input.category,
      title: input.title,
      details: input.note,
      requested_at: input.etaIso,
      location: input.address,
    }),
  });
  return { ref: out.id, confirmedEtaIso: out.eta, quotedPence: out.price_pence };
}
