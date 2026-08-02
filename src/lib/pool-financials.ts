import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolFinancials = {
  prize_pot: number;
  paid_participant_count: number;
};

export async function getPoolFinancials(
  supabase: SupabaseClient,
  poolId: string
): Promise<PoolFinancials> {
  const { data, error } = await supabase
    .rpc("get_pool_financials", { p_pool_id: poolId })
    .single();

  if (error || !data) {
    return { prize_pot: 0, paid_participant_count: 0 };
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

  const { data, error } = await supabase.rpc("get_pools_financials", {
    pool_ids: poolIds,
  });

  const map = new Map<string, PoolFinancials>();
  if (error || !data) return map;

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
