-- ============================================================================
-- Drop the legacy `picks` table.
--
-- It was superseded by `card_picks`, which is what scoring actually reads
-- (materializePoolWinners → computePoolWinners). `picks` was written only by
-- /api/pools/[poolId]/cards/[cardId]/submit, which is now a 410 stub, and no
-- code path reads it.
--
-- Leaving it in place was an active hazard rather than harmless dead weight: it
-- is a user-attributed predictions table that LOOKS authoritative, so a future
-- change could reasonably scored against it and silently pay the wrong player.
-- Removing it makes card_picks unambiguously the only source of picks.
--
-- Verified unreferenced before dropping:
--   grep -rn '"picks"' src/  → only a React Query cache key, never a table.
-- ============================================================================

drop policy if exists "Own picks only"                          on public.picks;
drop policy if exists "Picks are viewable by pool participants" on public.picks;
drop policy if exists "Users can insert own picks"              on public.picks;
drop policy if exists "Users can update own picks"              on public.picks;

drop table if exists public.picks;
