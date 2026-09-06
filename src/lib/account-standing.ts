import type { SupabaseClient } from "@supabase/supabase-js";

/** A missing profile or failed lookup cannot authorize a new session. */
export async function readAccountStanding(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("users")
    .select("account_status, suspended_until")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || !["active", "blocked", "suspended"].includes(data.account_status)) {
    throw new Error("Could not verify account status");
  }
  const suspendedUntil = data.suspended_until ? new Date(data.suspended_until as string) : null;
  if (suspendedUntil && Number.isNaN(suspendedUntil.getTime())) {
    throw new Error("Could not verify suspension expiry");
  }
  return { status: data.account_status as "active" | "blocked" | "suspended", suspendedUntil };
}
