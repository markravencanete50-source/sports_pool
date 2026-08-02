-- Store computed winners per pool (materialized when pool is completed)
create table if not exists public.pool_winners (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  correct integer not null,
  total integer not null,
  amount numeric not null,
  total_score_diff numeric not null default 0,
  created_at timestamp with time zone default now()
);

create index if not exists idx_pool_winners_pool on public.pool_winners(pool_id);
create index if not exists idx_pool_winners_user on public.pool_winners(user_id);

alter table public.pool_winners enable row level security;

create policy "Users can view own pool wins" on public.pool_winners
  for select using (auth.uid() = user_id);

create policy "Anyone can view pool winners for completed pools (ticker)"
  on public.pool_winners for select using (
    exists (
      select 1 from public.pools
      where pools.id = pool_winners.pool_id and pools.status = 'completed'
    )
  );
