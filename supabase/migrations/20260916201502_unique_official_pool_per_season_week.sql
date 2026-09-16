-- One platform-managed pool per NFL season/week. The season is part of the
-- key so Week 1 can be created again next season, while concurrent admin
-- requests for the same slate cannot create duplicate official pools.
create unique index if not exists uq_pools_official_season_week
  on public.pools (season, week_id)
  where is_system_weekly_pool is true;
