/**
 * Settlement regression checks — `npm run verify:settlement`
 *
 * Exercises the real computePoolWinners(), the function that decides who gets
 * paid. Pure and dependency-free, so it runs without a database or network.
 *
 * Locks in two things that were found by running a seeded pool end to end:
 *   1. Payouts must be whole cents and must sum to EXACTLY the net pot. The
 *      split was raw float division (netPot / n), which credited values like
 *      33.333333333333336 to a money balance.
 *   2. A card only scores if it has a pick for every finished game. This is
 *      what makes deleting a losing pick self-defeating rather than an exploit,
 *      and it must not regress.
 *
 * Exits non-zero on failure so it can gate a deploy.
 */
import { computePoolWinners } from "../src/lib/winners";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : " -> " + detail}`);
};

const finished = (id: string, h: number, a: number) => ({
  game_id: id,
  games: { status: "finished", home_score: h, away_score: a },
});

// ---------------------------------------------------------------- scenarios
console.log("\nScoring and tiebreak");
{
  // G1 home 24-17 (total 41), G2 away 10-20 (30), G3 tie 14-14 (28), G4 home 31-3 (34)
  const games = [
    finished("g1", 24, 17),
    finished("g2", 10, 20),
    finished("g3", 14, 14),
    finished("g4", 31, 3),
  ];
  const cards = [
    { id: "ca", user_id: "alice" },
    { id: "cb", user_id: "bob" },
    { id: "cc", user_id: "carol" },
  ];
  const p = (card: string, g: string, pred: string, tsp: number) => ({
    card_id: card,
    game_id: g,
    prediction: pred,
    total_score_prediction: tsp,
  });
  const picks = [
    // alice: 4/4, tiebreak diff 4
    p("ca", "g1", "home_win", 45), p("ca", "g2", "away_win", 30),
    p("ca", "g3", "tie", 28),      p("ca", "g4", "home_win", 34),
    // bob: 4/4, tiebreak diff 1  -> sole winner
    p("cb", "g1", "home_win", 42), p("cb", "g2", "away_win", 30),
    p("cb", "g3", "tie", 28),      p("cb", "g4", "home_win", 34),
    // carol: 3/4
    p("cc", "g1", "home_win", 41), p("cc", "g2", "away_win", 30),
    p("cc", "g3", "home_win", 28), p("cc", "g4", "home_win", 34),
  ];
  const base = { pool: { id: "p", name: "x", prize_pot: 80 }, poolGames: games, platformFeePercentage: 10 };

  const w = computePoolWinners({ ...base, poolCards: cards, picks } as any);
  check("closest total-score prediction wins", w.length === 1 && w[0].userId === "bob", JSON.stringify(w.map((x) => x.userId)));
  check("winner receives pot less platform fee", Number(w[0]?.amount) === 72, String(w[0]?.amount));

  // exact tie -> split
  const tied = picks.map((x) => (x.card_id === "ca" && x.game_id === "g1" ? { ...x, total_score_prediction: 42 } : x));
  const w2 = computePoolWinners({ ...base, poolCards: cards, picks: tied } as any);
  check("exact tie splits the pot", w2.length === 2 && w2.every((x) => Number(x.amount) === 36), JSON.stringify(w2.map((x) => x.amount)));

  // incomplete card is disqualified, not scored on percentage
  const partial = [...picks.filter((x) => x.card_id !== "cc"), p("cc", "g1", "home_win", 41)];
  const w3 = computePoolWinners({ ...base, poolCards: cards, picks: partial } as any);
  check("card missing picks is disqualified", !w3.some((x) => x.userId === "carol"));

  /*
   * Tiebreak must be COUNT-AWARE.
   *
   * total_score_prediction is optional per pick and the tiebreak sums the error
   * only over games where one was supplied. Comparing raw sums therefore
   * rewarded predicting LESS: bob, predicting a single total and off by 5, beat
   * alice, who predicted all four and was off by 3 each (sum 12). Supplying
   * exactly one prediction became the dominant strategy.
   *
   * Both cards below go 4/4, so only the tiebreak separates them. Alice has
   * full coverage and must win.
   */
  const pNo = (card: string, g: string, pred: string) => ({
    card_id: card, game_id: g, prediction: pred, total_score_prediction: null,
  });
  const coverage = [
    // alice: every total predicted, off by 3 on each (raw sum 12)
    p("ca", "g1", "home_win", 45), p("ca", "g2", "away_win", 33),
    p("ca", "g3", "tie", 31),      p("ca", "g4", "home_win", 37),
    // bob: one total predicted, off by 5 (raw sum 5) — must NOT win on that
    p("cb", "g1", "home_win", 47), pNo("cb", "g2", "away_win"),
    pNo("cb", "g3", "tie"),        pNo("cb", "g4", "home_win"),
  ];
  const w5 = computePoolWinners({
    ...base,
    poolCards: cards.filter((c) => c.id !== "cc"),
    picks: coverage,
  } as any);
  check(
    "full tiebreak coverage beats a single lucky prediction",
    w5.length === 1 && w5[0].userId === "alice",
    JSON.stringify(w5.map((x) => x.userId))
  );

  // All-wrong card wins nothing. Each pick must actually be wrong for the
  // outcome it faces: g1/g2/g4 were decisive so "tie" loses; g3 WAS a tie so it
  // needs a decisive pick to be wrong. (A blanket "away_win" is not all-wrong —
  // g2 finished 10-20, so away_win would score.)
  const wrongFor: Record<string, string> = {
    g1: "tie", g2: "tie", g3: "home_win", g4: "tie",
  };
  const allWrong = cards.flatMap((c) =>
    games.map((g) => p(c.id, g.game_id, wrongFor[g.game_id], 30))
  );
  const w4 = computePoolWinners({ ...base, poolCards: cards, picks: allWrong } as any);
  check("no winner when nobody scores", w4.length === 0, String(w4.length));
}

// ------------------------------------------------------------ money rounding
console.log("\nPayout rounding (swept)");
{
  const games = [finished("g1", 20, 10), finished("g2", 20, 10)];
  const payouts = (n: number, pot: number, fee: number) => {
    const cards = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, user_id: `u${i}` }));
    const picks = cards.flatMap((c) =>
      games.map((g) => ({ card_id: c.id, game_id: g.game_id, prediction: "home_win", total_score_prediction: 30 }))
    );
    return computePoolWinners({
      pool: { id: "p", name: "x", prize_pot: pot },
      poolCards: cards, picks, poolGames: games, platformFeePercentage: fee,
    } as any);
  };

  const pots = [80, 100, 1000 / 9, 33.33, 0.05, 999.99, 20, 61.73, 7];
  const counts = [1, 2, 3, 4, 5, 6, 7, 9, 11];
  const fees = [0, 10, 12.5];

  let bad = 0, swept = 0;
  for (const fee of fees) for (const pot of pots) for (const n of counts) {
    const w = payouts(n, pot, fee);
    const netCents = Math.round(pot * (1 - fee / 100) * 100);
    const cents = w.map((x) => Math.round(Number(x.amount) * 100));
    const whole = w.every((x) => Math.abs(Number(x.amount) * 100 - Math.round(Number(x.amount) * 100)) < 1e-9);
    const sums = cents.reduce((s, c) => s + c, 0) === netCents;
    const fair = Math.max(...cents) - Math.min(...cents) <= 1;
    swept++;
    if (!whole || !sums || !fair) { bad++; console.log(`    pot=${pot} n=${n} fee=${fee}`); }
  }
  check(`all payouts whole cents, sum to net pot, spread <= 1c (${swept} combinations)`, bad === 0, `${bad} bad`);
}

console.log(`\n${failures === 0 ? "settlement checks passed" : failures + " settlement check(s) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
