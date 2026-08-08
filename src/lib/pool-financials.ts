import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pool money figures, derived from completed pool_transactions.
 *
 * `prize_pot` is GROSS entry fees. Settlement applies the platform fee itself —
 * computePoolWinners derives netPot from prize_pot and platformFeePercentage —
 * so redefining prize_pot as net here would deduct the fee twice.
 * `net_prize_pot` is what a winner actually receives, already net of the fee, so
 * display code never has to recompute it.
 *
 * Both RPCs previously had EXECUTE granted to nobody: anon and authenticated got
 * 42501, and the helpers below swallowed the error and returned zero. That is
 * why the prize pot read $0 across the lobby, pool detail and My Games while
 * settlement paid out correctly — settlement is the one caller that uses the
 * service-role client. Errors are now logged rather than silently flattened.
 */
export type PoolFinancials = {
  /** Gross entry fees taken for the pool. */
  prize_pot: number;
  paid_participant_count: number;
  total_players: number;
  /** Platform's cut, summed from the recorded per-transaction fee. */
  platform_fee: number;
  /** Gross minus the platform fee — what a winner is actually paid. */
  net_prize_pot: number;
};

const EMPTY: PoolFinancials = {
  prize_pot: 0,
  paid_participant_count: 0,
  total_players: 0,
  platform_fee: 0,
  net_prize_pot: 0,
};

type FinancialsRow = {
  prize_pot?: number | string | null;
  paid_participant_count?: number | string | null;
  total_players?: number | string | null;
  platform_fee?: number | string | null;
  net_prize_pot?: number | string | null;
};

function toFinancials(row: FinancialsRow): PoolFinancials {
  return {
    prize_pot: Number(row.prize_pot ?? 0),
    paid_participant_count: Number(row.paid_participant_count ?? 0),
    total_players: Number(row.total_players ?? 0),
    platform_fee: Number(row.platform_fee ?? 0),
    net_prize_pot: Number(row.net_prize_pot ?? 0),
  };
}

export async function getPoolFinancials(
  supabase: SupabaseClient,
  poolId: string
): Promise<PoolFinancials> {
  const { data, error } = await supabase
    .rpc("get_pool_financials", { p_pool_id: poolId })
    .single();

  if (error || !data) {
    // Falling back to zero is the safe display default, but it must never be
    // silent again: a zero pot that comes from a failed call looks exactly like
    // a pool nobody has entered.
    if (error) {
      console.error(
        `[pool-financials] get_pool_financials(${poolId}) failed:`,
        error.message
      );
    }
    return EMPTY;
  }

  return toFinancials(data as FinancialsRow);
}

export async function getPoolsFinancials(
  supabase: SupabaseClient,
  poolIds: string[]
): Promise<Map<string, PoolFinancials>> {
  const map = new Map<string, PoolFinancials>();
  if (poolIds.length === 0) return map;

  const { data, error } = await supabase.rpc("get_pools_financials", {
    pool_ids: poolIds,
  });

  if (error || !data) {
    if (error) {
      console.error(
        `[pool-financials] get_pools_financials(${poolIds.length} pools) failed:`,
        error.message
      );
    }
    return map;
  }

  for (const row of data as Array<FinancialsRow & { pool_id: string }>) {
    map.set(row.pool_id, toFinancials(row));
  }
  return map;
}

export function attachFinancialsToPools<T extends { id: string }>(
  pools: T[],
  financialsMap: Map<string, PoolFinancials>
): (T & {
  prize_pot: number;
  participants: number;
  platform_fee: number;
  net_prize_pot: number;
})[] {
  return pools.map((pool) => {
    const f = financialsMap.get(pool.id) ?? EMPTY;
    return {
      ...pool,
      prize_pot: f.prize_pot,
      participants: f.paid_participant_count,
      platform_fee: f.platform_fee,
      net_prize_pot: f.net_prize_pot,
    };
  });
}
