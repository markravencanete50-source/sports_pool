import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";

/**
 * Last-outcome record for each scheduled job.
 *
 * ONE ROW PER JOB, overwritten every run. The admin dashboard's "failed jobs"
 * and "last successful sync" tiles read it; nothing else does. This is the
 * whole of the job history on purpose — a table of every run would be the
 * event log the operator asked not to have.
 *
 * Best-effort: a failure to record the outcome never fails the job.
 */
export type SystemJobName = "settle" | "reconcile" | "alert" | "nfl_sync";

export async function markJobStarted(job: SystemJobName): Promise<void> {
  await upsert(job, {
    last_started_at: new Date().toISOString(),
    last_status: "running",
    last_error: null,
  });
}

export async function markJobFinished(
  job: SystemJobName,
  outcome: { ok: true; detail?: unknown } | { ok: false; error: string; detail?: unknown }
): Promise<void> {
  const now = new Date().toISOString();
  await upsert(job, {
    last_finished_at: now,
    last_status: outcome.ok ? "ok" : "error",
    last_error: outcome.ok ? null : outcome.error.slice(0, 2000),
    last_detail: outcome.detail ?? null,
    ...(outcome.ok ? { last_success_at: now } : {}),
  });
}

/** Wrap a job body so its outcome is recorded whatever happens inside. */
export async function recordJobRun<T>(
  job: SystemJobName,
  body: () => Promise<T>,
  summarise?: (result: T) => unknown
): Promise<T> {
  await markJobStarted(job);
  try {
    const result = await body();
    await markJobFinished(job, { ok: true, detail: summarise ? summarise(result) : undefined });
    return result;
  } catch (err) {
    await markJobFinished(job, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function upsert(job: SystemJobName, patch: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("system_jobs")
      .upsert({ job, ...patch, updated_at: new Date().toISOString() }, { onConflict: "job" });
    if (error) logEvent("warn", "system_jobs.upsert_failed", { job, reason: error.message });
  } catch (err) {
    logEvent("warn", "system_jobs.upsert_threw", {
      job,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
