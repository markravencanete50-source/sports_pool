import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PoolRow } from "@/lib/types";

export type { PoolRow } from "@/lib/types";

export async function getPoolForUser(
  supabase: SupabaseClient,
  poolId: string,
  userId: string,
  select = "id, status, max_participants, entry_fee"
): Promise<{ data: PoolRow | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("pools")
    .select(select)
    .eq("id", poolId)
    .single();

  if (!error && data) {
    return { data: data as unknown as PoolRow, error: null };
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { data: null, error: null };
    }
    const admin = createAdminClient();
    const [{ data: participant }, { data: invited }] = await Promise.all([
      admin
        .from("pool_participants")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("pool_invitations")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("invited_user_id", userId)
        .eq("status", "accepted")
        .maybeSingle(),
    ]);
    if (!participant && !invited) {
      return { data: null, error: null };
    }
    const { data: pool, error: adminError } = await admin
      .from("pools")
      .select(select)
      .eq("id", poolId)
      .single();
    if (adminError || !pool) {
      return { data: null, error: null };
    }
    return { data: pool as unknown as PoolRow, error: null };
  } catch {
    return { data: null, error: null };
  }
}
