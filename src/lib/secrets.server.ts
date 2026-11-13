/* eslint-disable @typescript-eslint/no-explicit-any -- platform_secrets is read loosely */
/**
 * Server only: keys saved in Latchkey admin (platform_secrets "api_keys", service role only).
 * loadSecrets() runs from the request middleware and refreshes the cache that secret() reads
 * at most every SECRETS_TTL_MS, so a saved key is used without publishing again. The ElevenLabs
 * key keeps living in "studio_voices" (the studio voices card made it there first).
 */
import {
  SECRETS,
  SECRETS_ROW,
  SECRETS_TTL_MS,
  editableInApp,
  maskSecret,
  savedSecretsAge,
  secretDef,
  secretProblem,
  setSavedSecrets,
  tidySecret,
  type SecretDef,
} from "./secrets";

type Saved = { value: string; at: string; by: string | null };
type Row = Record<string, Saved & { previous?: { value: string; at: string } }>;

const STUDIO = "studio_voices";
const ELEVEN = "ELEVENLABS_API_KEY";

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function readRow(key: string): Promise<any> {
  const { data, error } = await (
    await db()
  )
    .from("platform_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

async function writeRow(key: string, value: unknown): Promise<void> {
  const { error } = await (
    await db()
  )
    .from("platform_secrets")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

let loading: Promise<void> | null = null;

/** Refresh the saved keys if they're older than the TTL (or always, with force). Never throws. */
export async function loadSecrets(force = false): Promise<void> {
  if (!force && savedSecretsAge() < SECRETS_TTL_MS) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const [row, studio] = await Promise.all([readRow(SECRETS_ROW), readRow(STUDIO)]);
      const values: Record<string, string> = {};
      for (const [name, s] of Object.entries((row ?? {}) as Row)) {
        if (editableInApp(name) && typeof s?.value === "string" && s.value.trim())
          values[name] = s.value.trim();
      }
      if (typeof studio?.apiKey === "string" && studio.apiKey.trim())
        values[ELEVEN] = studio.apiKey.trim();
      setSavedSecrets(values);
    } catch (e) {
      console.error("Keys and secrets: couldn't read saved keys", e);
      // Keep what we had; try again on the next request after a short pause.
      if (savedSecretsAge() === Infinity) setSavedSecrets({});
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export type SecretRow = {
  name: string;
  /** Which value Latchkey uses now. */
  source: "app" | "lovable" | "none";
  /** Masked, or whole when not confidential. */
  shown: string | null;
  /** The Lovable Secrets value, shown the same way, when a saved one overrides it. */
  lovable: string | null;
  savedAt: string | null;
  savedBy: string | null;
  previousAt: string | null;
  /** The value in use looks wrong. */
  problem: string | null;
};

const envOf = (name: string) => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
};

const display = (d: SecretDef, v: string | null) =>
  v === null ? null : d.confidential ? maskSecret(v) : v;

export async function secretRows(): Promise<SecretRow[]> {
  const [row, studio] = await Promise.all([readRow(SECRETS_ROW), readRow(STUDIO)]);
  const saved = { ...((row ?? {}) as Row) };
  if (typeof studio?.apiKey === "string" && studio.apiKey.trim())
    saved[ELEVEN] = {
      value: studio.apiKey.trim(),
      at: studio.keyAt ?? "",
      by: studio.keyBy ?? null,
    };
  return SECRETS.map((d) => {
    const app = d.edit === "app" ? saved[d.name]?.value?.trim() || null : null;
    const env = envOf(d.name);
    const used = app ?? env;
    return {
      name: d.name,
      source: app ? "app" : env ? "lovable" : "none",
      shown: display(d, used),
      lovable: app && env ? display(d, env) : null,
      savedAt: app ? saved[d.name]?.at || null : null,
      savedBy: app ? (saved[d.name]?.by ?? null) : null,
      previousAt: saved[d.name]?.previous?.at ?? null,
      problem: used ? secretProblem(d.name, used) : null,
    };
  });
}

/** Save (or clear, with an empty value) a key. Returns the tidied value's problem, if saved anyway. */
export async function saveSecret(
  name: string,
  raw: string,
  by: string | null,
  force: boolean,
): Promise<{ problem: string | null }> {
  const d = secretDef(name);
  if (!d || d.edit !== "app") throw new Error("That key can't be changed here.");
  const value = tidySecret(name, raw);
  const problem = value ? secretProblem(name, value) : null;
  if (problem && !force) throw new Error(problem);
  const at = new Date().toISOString();

  if (name === ELEVEN) {
    const studio = ((await readRow(STUDIO)) ?? {}) as Record<string, unknown>;
    if (value) {
      const { saveStudioKey } = await import("./studio-voices.server");
      await saveStudioKey(value); // checks it with ElevenLabs first
      await writeRow(STUDIO, {
        ...((await readRow(STUDIO)) ?? {}),
        keyAt: at,
        keyBy: by,
        previousKey: studio["apiKey"] ?? null,
        previousKeyAt: studio["apiKey"] ? at : null,
      });
    } else {
      await writeRow(STUDIO, {
        ...studio,
        apiKey: null,
        previousKey: studio["apiKey"] ?? null,
        previousKeyAt: at,
      });
    }
  } else {
    const row = ((await readRow(SECRETS_ROW)) ?? {}) as Row;
    const old = row[name];
    const previous = old?.value ? { value: old.value, at: old.at } : old?.previous;
    if (value) row[name] = { value, at, by, ...(previous ? { previous } : {}) };
    else if (previous) row[name] = { value: "", at, by, previous };
    else delete row[name];
    await writeRow(SECRETS_ROW, row);
  }
  await loadSecrets(true);
  return { problem };
}

/** The whole value, for the super admin's own backup. Never Lovable's own keys. */
export async function revealSecret(
  name: string,
  which: "current" | "lovable" | "previous",
): Promise<string | null> {
  const d = secretDef(name);
  if (!d || !d.revealable) throw new Error("That key is never shown.");
  if (which === "lovable") return envOf(name);
  if (name === ELEVEN) {
    const studio = ((await readRow(STUDIO)) ?? {}) as Record<string, any>;
    if (which === "previous") return studio["previousKey"] ?? null;
    return studio["apiKey"] || envOf(name);
  }
  const row = ((await readRow(SECRETS_ROW)) ?? {}) as Row;
  if (which === "previous") return row[name]?.previous?.value ?? null;
  return (d.edit === "app" ? row[name]?.value?.trim() || null : null) ?? envOf(name);
}
