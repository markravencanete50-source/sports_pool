import { DISRUPTED_STATUSES } from "@/lib/constants";
import type { ComputePoolWinnersInput, PoolWinnerResult } from "@/lib/types";

export { DISRUPTED_STATUSES } from "@/lib/constants";
export type {
  WinningEntry,
  ComputePoolWinnersInput,
  PoolWinnerResult,
} from "@/lib/types";

export function isGameDisrupted(status: string | undefined): boolean {
  if (!status) return false;
  return (DISRUPTED_STATUSES as readonly string[]).includes(
    status.toLowerCase()
  );
}

function isCorrectPick(
  prediction: string,
  gameStatus: string,
  homeScore: number | null,
  awayScore: number | null
): boolean {
  if (isGameDisrupted(gameStatus)) return true;
  if (gameStatus !== "finished" || homeScore === null || awayScore === null)
    return false;
  let actualOutcome: "home_win" | "away_win" | "tie";
  if (homeScore > awayScore) actualOutcome = "home_win";
  else if (awayScore > homeScore) actualOutcome = "away_win";
  else actualOutcome = "tie";
  return prediction === actualOutcome;
}

function getTotalScoreDiff(
  prediction: number | null | undefined,
  actualTotal: number
): number {
  if (prediction == null) return 0;
  return Math.abs(prediction - actualTotal);
}

/** Pool game row as returned by Supabase (pool_games + games join). */
type PoolGameRow = {
  game_id: string;
  games?:
    | {
        status?: string;
        home_score?: number | null;
        away_score?: number | null;
      }
    | {
        status?: string;
        home_score?: number | null;
        away_score?: number | null;
      }[];
};

/** Pick row with card_id, game_id, prediction. */
type PickRow = { card_id: string; game_id: string; prediction: string | null };

/**
 * Compute correct/total for a single card in a pool. Use for showing the user's pick result on lost games.
 */
export function getUserCardScore(
  poolGames: PoolGameRow[],
  picks: PickRow[],
  cardId: string
): { correct: number; total: number } {
  const finishedGameIds = new Set<string>();
  for (const pg of poolGames) {
    const gameData = Array.isArray(pg.games) ? pg.games[0] : pg.games;
    if (!gameData) continue;
    const status = gameData.status;
    const homeScore = gameData.home_score ?? null;
    const awayScore = gameData.away_score ?? null;
    const finished =
      status === "finished" && homeScore !== null && awayScore !== null;
    const disrupted = isGameDisrupted(status);
    if (finished || disrupted) finishedGameIds.add(pg.game_id);
  }
  let correct = 0;
  let total = 0;
  for (const pick of picks) {
    if (pick.card_id !== cardId || !finishedGameIds.has(pick.game_id)) continue;
    const poolGame = poolGames.find((pg) => pg.game_id === pick.game_id);
    const gameData = Array.isArray(poolGame?.games)
      ? poolGame?.games[0]
      : poolGame?.games;
    if (!gameData) continue;
    total++;
    if (
      isCorrectPick(
        pick.prediction ?? "",
        gameData.status ?? "",
        gameData.home_score ?? null,
        gameData.away_score ?? null
      )
    ) {
      correct++;
    }
  }
  return { correct, total };
}

export function computePoolWinners(
  input: ComputePoolWinnersInput
): PoolWinnerResult[] {
  const {
    pool,
    poolCards,
    picks,
    poolGames,
    platformFeePercentage = 10,
  } = input;

  const netPot = pool.prize_pot * (1 - platformFeePercentage / 100);
  const cardIds = poolCards.map((c) => c.id);
  const cardIdToUserId = new Map(poolCards.map((c) => [c.id, c.user_id]));

  const finishedGameIds = new Set<string>();
  for (const pg of poolGames) {
    const gameData = Array.isArray(pg.games) ? pg.games[0] : pg.games;
    if (!gameData) continue;
    const status = gameData.status;
    const homeScore = gameData.home_score ?? null;
    const awayScore = gameData.away_score ?? null;
    const finished =
      status === "finished" && homeScore !== null && awayScore !== null;
    const disrupted = isGameDisrupted(status);
    if (finished || disrupted) finishedGameIds.add(pg.game_id);
  }
  const numFinishedGames = finishedGameIds.size;
  if (numFinishedGames === 0) return [];

  const cardScores: Record<
    string,
    {
      correct: number;
      total: number;
      totalScoreDifference: number;
      // How many finished games this card actually supplied a total-score
      // prediction for. A card that supplied none must NOT win a tie with its
      // default diff of 0 (see the tiebreak below).
      predictedCount: number;
    }
  > = {};

  /*
   * TIEBREAK — must be comparable across cards, so it has to be count-aware.
   *
   * totalScoreDifference only accumulates over games where a prediction was
   * actually supplied, and total_score_prediction is optional per pick. So
   * comparing the raw sums rewarded predicting LESS: a card that predicted one
   * game and was off by 5 (sum 5) beat a card that predicted all four and was
   * off by 3 on each (sum 12) — the strictly better forecaster lost the pot.
   * Predicting exactly one total was the dominant strategy.
   *
   * Charge a worst-case penalty for every MISSING prediction instead of only
   * for a card that supplied none. A card with full coverage can then only be
   * beaten by another card with full coverage and a smaller error, and the
   * "no predictions at all" case falls out as the limiting case.
   */
  const MAX_TOTAL_SCORE_ERROR = 200; // total_score_prediction is capped at 200
  const tiebreakOf = (s: { totalScoreDifference: number; predictedCount: number }) =>
    s.totalScoreDifference +
    Math.max(0, numFinishedGames - s.predictedCount) * MAX_TOTAL_SCORE_ERROR;

  for (const pick of picks) {
    if (!cardIds.includes(pick.card_id)) continue;
    if (!finishedGameIds.has(pick.game_id)) continue;

    const userId = cardIdToUserId.get(pick.card_id);
    if (!userId) continue;

    const poolGame = poolGames.find((pg) => pg.game_id === pick.game_id);
    const gameData = Array.isArray(poolGame?.games)
      ? poolGame?.games[0]
      : poolGame?.games;
    if (!gameData) continue;

    const status = gameData.status;
    const homeScore = gameData.home_score ?? null;
    const awayScore = gameData.away_score ?? null;

    if (!cardScores[pick.card_id]) {
      cardScores[pick.card_id] = {
        correct: 0,
        total: 0,
        totalScoreDifference: 0,
        predictedCount: 0,
      };
    }
    cardScores[pick.card_id].total++;
    if (isCorrectPick(pick.prediction, status, homeScore, awayScore)) {
      cardScores[pick.card_id].correct++;
    }
    if (
      status === "finished" &&
      homeScore !== null &&
      awayScore !== null &&
      pick.total_score_prediction != null
    ) {
      cardScores[pick.card_id].totalScoreDifference += getTotalScoreDiff(
        pick.total_score_prediction,
        homeScore + awayScore
      );
      cardScores[pick.card_id].predictedCount++;
    }
  }

  const userBest: Record<
    string,
    {
      cardId: string;
      correct: number;
      total: number;
      // Real accumulated diff, stored on the winner row for display.
      totalScoreDifference: number;
      // Effective diff used for tie-breaking (worst-case when no prediction).
      tiebreak: number;
    }
  > = {};

  for (const card of poolCards) {
    const score = cardScores[card.id];
    if (!score || score.total !== numFinishedGames) continue;
    const pct = score.correct / score.total;
    const existing = userBest[card.user_id];
    if (
      !existing ||
      pct > existing.correct / existing.total ||
      (pct === existing.correct / existing.total &&
        tiebreakOf(score) < existing.tiebreak)
    ) {
      userBest[card.user_id] = {
        cardId: card.id,
        correct: score.correct,
        total: score.total,
        totalScoreDifference: score.totalScoreDifference,
        tiebreak: tiebreakOf(score),
      };
    }
  }

  let bestPercentage = 0;
  // totalScoreDiff here carries the EFFECTIVE tiebreak (worst-case for cards
  // that gave no total-score prediction), so the sort/filter below cannot be
  // won by a defaulted 0. The winner's real diff is read from userBest.
  let tied: Array<{ userId: string; totalScoreDiff: number }> = [];

  for (const userId of Object.keys(userBest)) {
    const s = userBest[userId];
    if (s.total === 0) continue;
    const pct = s.correct / s.total;
    if (pct > bestPercentage) {
      bestPercentage = pct;
      tied = [{ userId, totalScoreDiff: s.tiebreak }];
    } else if (pct === bestPercentage) {
      tied.push({ userId, totalScoreDiff: s.tiebreak });
    }
  }

  if (tied.length === 0 || bestPercentage === 0) return [];

  if (tied.length > 1) {
    tied.sort((a, b) => a.totalScoreDiff - b.totalScoreDiff);
    const best = tied[0].totalScoreDiff;
    tied = tied.filter((t) => t.totalScoreDiff === best);
  }

  /*
   * MONEY PRECISION.
   *
   * This was `const split = netPot / tied.length` — raw float division, no
   * rounding. A 3-way split of a $100 net pot returns 33.333333333333336, and
   * that value is credited straight to users.balance and written into
   * pool_winners.amount. The balance is then a number with 15 decimal places
   * that renders as $33.33 but is not $33.33, and it flows into withdrawal
   * threshold comparisons and admin payout amounts.
   *
   * Split in integer cents instead. Any indivisible remainder is handed out one
   * cent at a time, ordered by userId so the outcome is deterministic and
   * reproducible rather than dependent on object key order. The payouts then
   * sum to exactly the net pot, to the cent, for every pot and every winner
   * count.
   */
  const netCents = Math.round(netPot * 100);
  const n = tied.length;
  const baseCents = Math.floor(netCents / n);
  let remainderCents = netCents - baseCents * n;

  const ordered = [...tied].sort((a, b) => a.userId.localeCompare(b.userId));

  const amountByUser = new Map<string, number>();
  for (const t of ordered) {
    const extra = remainderCents > 0 ? 1 : 0;
    if (extra) remainderCents--;
    amountByUser.set(t.userId, (baseCents + extra) / 100);
  }

  return tied.map((t) => ({
    userId: t.userId,
    cardId: userBest[t.userId].cardId,
    correct: userBest[t.userId].correct,
    total: userBest[t.userId].total,
    totalScoreDiff: userBest[t.userId].totalScoreDifference,
    amount: amountByUser.get(t.userId) as number,
  }));
}
