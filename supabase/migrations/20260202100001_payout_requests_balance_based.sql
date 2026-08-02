alter table public.payout_requests
  drop constraint if exists payout_requests_user_id_pool_id_key;

alter table public.payout_requests
  alter column pool_id drop not null;
