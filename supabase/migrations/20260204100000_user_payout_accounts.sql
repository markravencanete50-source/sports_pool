create table if not exists public.user_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  method text not null check (method in ('paypal', 'revolut')),
  identifier text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id)
);

create index if not exists idx_user_payout_accounts_user on public.user_payout_accounts(user_id);

alter table public.user_payout_accounts enable row level security;

create policy "Users can view own payout account" on public.user_payout_accounts
  for select using (auth.uid() = user_id);

create policy "Users can insert own payout account" on public.user_payout_accounts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own payout account" on public.user_payout_accounts
  for update using (auth.uid() = user_id);

create policy "Admin can view all payout accounts" on public.user_payout_accounts
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );
