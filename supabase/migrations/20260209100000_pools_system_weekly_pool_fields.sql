-- Add fields to distinguish the system-created weekly public pool from manually created public pools.
-- is_system_weekly_pool: true only for pools created via "Sync & Create Weekly Public Pool".
-- week_id: the NFL week number for that system weekly pool (same as week, but only set when is_system_weekly_pool is true).

alter table public.pools
  add column if not exists is_system_weekly_pool boolean default false,
  add column if not exists week_id integer;

comment on column public.pools.is_system_weekly_pool is 'True when the pool was created by the system via Sync & Create Weekly Public Pool; false or null otherwise.';
comment on column public.pools.week_id is 'NFL week number for the system weekly pool; set when is_system_weekly_pool is true.';

create index if not exists idx_pools_is_system_weekly_week_id
  on public.pools (is_system_weekly_pool, week_id)
  where is_system_weekly_pool = true;
