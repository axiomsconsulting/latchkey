/* eslint-disable @typescript-eslint/no-explicit-any -- reads tables and payloads the generated Supabase types don't cover */
/**
 * Counting what costs Run credits, and the routine switches. Server only.
 * Both fail open: a missing table (before migration 0027) never breaks the
 * feature being counted or checked.
 */
import { JOBS, jobDue, type JobSetting } from "./jobs";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    from: (t: string) => any;
  };
}

export async function bumpUsage(hostId: string | null, metric: string, n = 1): Promise<void> {
  try {
    const db = await admin();
    await db.rpc("bump_usage", { _host_id: hostId, _metric: metric, _n: n });
  } catch {
    // Counting must never stop the work itself.
  }
}

let cache: { at: number; rows: JobSetting[] } | null = null;

async function settings(): Promise<JobSetting[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  try {
    const db = await admin();
    const { data, error } = await db
      .from("job_settings")
      .select("key, enabled, every_minutes, last_run_at");
    const rows = error ? [] : ((data ?? []) as JobSetting[]);
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return [];
  }
}

export function forgetJobSettings() {
  cache = null;
}

/** Is this routine switched on (and, if scheduled, due)? */
export async function jobAllowed(key: string): Promise<boolean> {
  const job = JOBS.find((j) => j.key === key);
  if (!job) return true;
  const s = (await settings()).find((r) => r.key === key);
  return jobDue(job, s);
}

/** Records a run of a routine: when, how it went, how long it took. */
export async function recordRun(key: string, status: string, startedAt: number): Promise<void> {
  forgetJobSettings();
  try {
    const db = await admin();
    await db.from("job_settings").upsert(
      {
        key,
        last_run_at: new Date().toISOString(),
        last_status: status.slice(0, 300),
        last_duration_ms: Date.now() - startedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    const job = JOBS.find((j) => j.key === key);
    if (job) await bumpUsage(null, job.metric);
  } catch {
    // Bookkeeping only.
  }
}
