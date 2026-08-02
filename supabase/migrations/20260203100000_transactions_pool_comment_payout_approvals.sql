alter table public.user_transactions
  add column if not exists pool_id uuid references public.pools(id) on delete set null,
  add column if not exists comment text;

create table if not exists public.payout_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pool_id uuid not null references public.pools(id) on delete cascade,
  amount numeric not null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamp with time zone not null default now(),
  status text not null default 'pending_claim' check (status in ('pending_claim', 'claimed')),
  claimed_at timestamp with time zone,
  comment text,
  unique(user_id, pool_id)
);

create index if not exists idx_payout_approvals_user on public.payout_approvals(user_id);
create index if not exists idx_payout_approvals_pool on public.payout_approvals(pool_id);
create index if not exists idx_payout_approvals_status on public.payout_approvals(status);

alter table public.payout_approvals enable row level security;

create policy "Users can view own payout approvals" on public.payout_approvals
  for select using (auth.uid() = user_id);

create policy "Admin can view all payout approvals" on public.payout_approvals
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create unique index if not exists idx_user_transactions_winning_per_pool
  on public.user_transactions(user_id, pool_id)
  where type = 'winning_approved' and pool_id is not null;
