alter table public.users
  add column if not exists balance numeric not null default 0;

create table if not exists public.user_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  admin_id uuid references public.users(id) on delete set null,
  previous_balance numeric not null,
  amount numeric not null,
  final_balance numeric not null,
  type text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamp with time zone default now(),
  constraint user_transactions_final_check check (final_balance = previous_balance + amount)
);

create index if not exists idx_user_transactions_user on public.user_transactions(user_id);
create index if not exists idx_user_transactions_admin on public.user_transactions(admin_id);
create index if not exists idx_user_transactions_created on public.user_transactions(created_at desc);

alter table public.user_transactions enable row level security;

create policy "Users can view own transactions" on public.user_transactions
  for select using (auth.uid() = user_id);

create policy "Admin can view all transactions" on public.user_transactions
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

alter table public.pool_winners
  add column if not exists approved_at timestamp with time zone,
  add column if not exists approved_by uuid references public.users(id) on delete set null;

create index if not exists idx_pool_winners_approved on public.pool_winners(approved_at) where approved_at is null;
