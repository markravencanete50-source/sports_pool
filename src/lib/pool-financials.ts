import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type PoolFinancials = {
  prize_pot: number;
  paid_participant_count: number;
};

/*
 * EXECUTE on get_pool_financials / get_pools_financials is service_role-only,
 * so these run on the admin client regardless of the client passed in. The
 * figures are pool-level aggregates and every call site gates access first;
 * the client parameter is kept only so call sites stay stable.
 *
 * Errors THROW. Returning { prize_pot: 0 } on failure is indistinguishable
 * from a genuinely empty pot, and settlement would pay a real pool at zero.
 */
export async function getPoolFinancials(
  supabase: SupabaseClient,
  poolId: string
): Promise<PoolFinancials> {
  const { data, error } = await createAdminClient()
    .rpc("get_pool_financials", { p_pool_id: poolId })
    .single();

  if (error || !data) {
    throw new Error(
      `get_pool_financials failed for pool ${poolId}: ${
        error?.message ?? "no row returned"
      }`
    );
  }

  const row = data as { prize_pot?: number; paid_participant_count?: number };
  return {
    prize_pot: Number(row.prize_pot ?? 0),
    paid_participant_count: Number(row.paid_participant_count ?? 0),
  };
}

export async function getPoolsFinancials(
  supabase: SupabaseClient,
  poolIds: string[]
): Promise<Map<string, PoolFinancials>> {
  if (poolIds.length === 0) return new Map();

  const { data, error } = await createAdminClient().rpc(
    "get_pools_financials",
    { pool_ids: poolIds }
  );

  if (error || !data) {
    throw new Error(
      `get_pools_financials failed: ${error?.message ?? "no rows returned"}`
    );
  }

  const map = new Map<string, PoolFinancials>();
  for (const row of data as Array<{
    pool_id: string;
    prize_pot: number;
    paid_participant_count: number;
    total_players: number;
  }>) {
    map.set(row.pool_id, {
      prize_pot: Number(row.prize_pot ?? 0),
      paid_participant_count: Number(row.paid_participant_count ?? 0),
    });
  }
  return map;
}

export function attachFinancialsToPools<T extends { id: string }>(
  pools: T[],
  financialsMap: Map<string, PoolFinancials>
): (T & { prize_pot: number; participants: number })[] {
  return pools.map((pool) => {
    const f = financialsMap.get(pool.id) ?? {
      prize_pot: 0,
      paid_participant_count: 0,
    };
    return {
      ...pool,
      prize_pot: f.prize_pot,
      participants: f.paid_participant_count,
    };
  });
}
