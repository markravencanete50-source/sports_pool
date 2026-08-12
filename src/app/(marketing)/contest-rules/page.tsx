import type { Metadata } from "next";
import { SitePageShell } from "@/components/marketing/site-page-shell";

export const metadata: Metadata = {
  title: "Contest Rules | Sports Pool",
  description:
    "The binding rules for Sports Pool contests: scoring, tie-breaks, the platform fee, refunds, and what happens to postponed or cancelled fixtures.",
};

/*
 * These rules are BINDING TERMS and they describe what the settlement engine
 * actually does. Every statement below was written against the implementation
 * in src/lib/winners.ts and src/lib/materialize-winners.ts — the scoring
 * formula, the tie-break, the cent-level split and the disrupted-fixture
 * behaviour are all as coded, not as imagined.
 *
 * If the engine changes, THIS PAGE CHANGES IN THE SAME COMMIT. Published rules
 * that disagree with the code are worse than no published rules: they are the
 * document a player will hold you to in a dispute you will lose.
 */

const sections = [
  {
    title: "1. What A Contest Is",
    paragraphs: [
      "A pool is a contest with a fixed entry fee. Every entrant buys one or more parlay cards, and each card carries a prediction for every fixture in that pool. When all fixtures have finished, the pool settles: cards are scored, a winner or winners are determined, and the prize pot is credited to their balances.",
      "You may hold at most three cards in any one pool. Entry closes when the pool reaches its participant limit or its first fixture kicks off, whichever comes first.",
    ],
  },
  {
    title: "2. Making Picks",
    paragraphs: [
      "For each fixture you predict one of three outcomes: the home team wins, the away team wins, or the game is tied. You may also give a total-score prediction, which is used only as a tie-break.",
      "Picks lock at kick-off for each individual fixture. A pick cannot be changed, added or removed after that fixture has started, and this is enforced by the database rather than by the interface.",
    ],
    bullets: [
      "A card with no total-score prediction is scored normally, but is treated as the worst possible case if a tie-break is needed.",
      "Once locked, a card cannot be edited, transferred or refunded.",
    ],
  },
  {
    title: "3. Scoring",
    paragraphs: [
      "Each card is scored as the proportion of its picks that were correct. Where you hold more than one card in a pool, your best-scoring card represents you.",
      "The highest proportion of correct picks wins. If no entrant gets a single pick right, the contest produces no winner and Section 7 applies.",
    ],
  },
  {
    title: "4. Tie-Breaks",
    paragraphs: [
      "Where two or more entrants share the highest score, the tie is broken by the total-score prediction: whoever came closest, in absolute terms, to the combined final score of the fixtures wins.",
      "If entrants are still tied after that — the same score and the same total-score difference — the prize is split equally between them.",
    ],
    bullets: [
      "Splits are calculated in whole cents. Where a pot does not divide exactly, the remaining cents are distributed one each, in a fixed and reproducible order, so the payouts always sum to exactly the prize pot.",
      "An entrant who gave no total-score prediction ranks behind every entrant who did.",
    ],
  },
  {
    title: "5. The Prize Pot And The Platform Fee",
    paragraphs: [
      "The prize pot is the total of all entry fees paid into the pool, less the platform fee. The platform fee is a percentage, shown on the pool before you enter.",
      "The fee percentage is fixed for a pool at the moment it is created and cannot be changed once the pool exists. A change to the platform's default fee applies only to pools created afterwards, and can never re-split a pot that is already in play.",
    ],
  },
  {
    title: "6. Postponed, Abandoned And Cancelled Fixtures",
    paragraphs: [
      "If a fixture is postponed, suspended, abandoned or cancelled, it is treated as correct for every entrant. Nobody is advantaged or disadvantaged by a game that did not produce a result, and the contest settles on the fixtures that did.",
      "If a fixture is rescheduled and played before the pool settles, its real result is used.",
    ],
  },
  {
    title: "7. Contests With No Winner",
    paragraphs: [
      "If a pool produces no winner, the pot is not distributed and is not retained as profit. The pool is flagged for review and entry fees are returned to entrants.",
      "This is an exceptional outcome and is handled by a person, not automatically, so allow time for it to be processed.",
    ],
  },
  {
    title: "8. Refunds And Cancellation",
    paragraphs: [
      "Entry fees are not refundable once a pool's first fixture has kicked off, because your entry is by then competing for the pot.",
      "Before kick-off, an entry may be refunded if the pool is cancelled by us, if the pool fails to reach the minimum number of entrants, or if the entry was taken in error.",
    ],
    bullets: [
      "Where a refund is due it returns to the original payment method.",
      "A card bought with a payment that is later reversed or charged back is void, and any winnings from it are recoverable.",
    ],
  },
  {
    title: "9. Withdrawals",
    paragraphs: [
      "Winnings are credited to your balance when a pool settles. You may request a withdrawal of any settled balance above the published minimum.",
      "Withdrawals are paid to the payout account registered on your profile. Identity verification may be required before a withdrawal is released, and is always required once your cumulative withdrawals reach the threshold set out in the Privacy Policy.",
    ],
  },
  {
    title: "10. Eligibility",
    paragraphs: [
      "You must be of legal age in your jurisdiction, and at least 18 in every case, to enter a paid contest. Some jurisdictions require 21 or more, and where they do, that higher age applies to you.",
      "Paid contests are not available everywhere. Where a jurisdiction prohibits or licenses this kind of contest and we do not hold the necessary permission, entry is refused from that location.",
    ],
    bullets: [
      "Using a VPN, proxy or any other means to disguise your location in order to enter a contest is a breach of these rules and voids any resulting entry and winnings.",
      "Accounts found to have been opened by someone below the applicable minimum age are closed, and entry fees are returned rather than winnings paid.",
    ],
  },
  {
    title: "11. Fair Play",
    paragraphs: [
      "One person, one account. Opening multiple accounts to hold more than the permitted number of cards in a pool is a breach of these rules.",
      "We may void entries, withhold winnings and close accounts where we find collusion, automated entry, payment fraud, or any attempt to manipulate a contest or its settlement.",
    ],
  },
  {
    title: "12. Disputes",
    paragraphs: [
      "If you believe a contest has settled incorrectly, contact support within 30 days of settlement. Every settlement is reconstructable from the recorded fixtures, picks and scores, and a dispute is investigated against that record.",
      "Where a settlement error is confirmed, it is corrected and the correction is recorded against the pool.",
    ],
  },
  {
    title: "13. Changes To These Rules",
    paragraphs: [
      "These rules may change. The version that governs a contest is the version in force when you entered it, and a change never applies retrospectively to a pool you have already entered.",
      "Where the rules change materially you will be asked to accept the new version before entering another paid contest.",
    ],
  },
];

export default function ContestRulesPage() {
  return (
    <SitePageShell
      eyebrow="Legal"
      title="Contest Rules"
      description="The binding rules for every paid contest on Sports Pool: how cards are scored, how ties are broken, what the platform fee is, and what happens when a fixture does not go ahead."
      sections={sections}
      ctaTitle="Questions about a settlement?"
      ctaDescription="Every contest is reconstructable from the recorded fixtures, picks and scores. Contact support within 30 days and we will investigate against that record."
      ctaHref="/contact"
      ctaLabel="Contact Support"
    />
  );
}
