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

const DEFAULT_PLATFORM_FEE_PCT = 10;

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
};

/**
 * BUG FIX: platform_fee and net_prize_pot were always 0.
 *
 * get_pool_financials() only returns prize_pot / paid_participant_count /
 * total_players — it never returned platform_fee or net_prize_pot — so the old
 * toFinancials() read `row.platform_fee`/`row.net_prize_pot`, found them
 * undefined, and defaulted both to 0. Every "you'll receive" figure (My Games,
 * pool detail) therefore rendered $0.
 *
 * We derive them here from the same platform fee percentage settlement uses
 * (computePoolWinners: netPot = prize_pot * (1 - pct/100)), so the displayed
 * net matches what a winner is actually paid. Cent-rounded to avoid float dust.
 */
function toFinancials(row: FinancialsRow, feePct: number): PoolFinancials {
  const prize_pot = Number(row.prize_pot ?? 0);
  const platform_fee = Math.round(prize_pot * (feePct / 100) * 100) / 100;
  const net_prize_pot = Math.round((prize_pot - platform_fee) * 100) / 100;
  return {
    prize_pot,
    paid_participant_count: Number(row.paid_participant_count ?? 0),
    total_players: Number(row.total_players ?? 0),
    platform_fee,
    net_prize_pot,
  };
}

/** Current platform fee percentage, mirroring settlement's fallback of 10%. */
async function getPlatformFeePct(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("platform_settings")
    .select("platform_fee_percentage")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pct = Number(data?.platform_fee_percentage);
  return Number.isFinite(pct) ? pct : DEFAULT_PLATFORM_FEE_PCT;
}

export async function getPoolFinancials(
  supabase: SupabaseClient,
  poolId: string
): Promise<PoolFinancials> {
  const [{ data, error }, feePct] = await Promise.all([
    supabase.rpc("get_pool_financials", { p_pool_id: poolId }).single(),
    getPlatformFeePct(supabase),
  ]);

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

  return toFinancials(data as FinancialsRow, feePct);
}

export async function getPoolsFinancials(
  supabase: SupabaseClient,
  poolIds: string[]
): Promise<Map<string, PoolFinancials>> {
  const map = new Map<string, PoolFinancials>();
  if (poolIds.length === 0) return map;

  const [{ data, error }, feePct] = await Promise.all([
    supabase.rpc("get_pools_financials", { pool_ids: poolIds }),
    getPlatformFeePct(supabase),
  ]);

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
    map.set(row.pool_id, toFinancials(row, feePct));
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
