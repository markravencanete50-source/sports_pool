-- ============================================================================
-- CLIENT BRIEF FEATURES + ADMIN CONSOLE FOUNDATION
--
-- One migration, deliberately, because the two bodies of work it serves share
-- the same rows: the client's 1 August brief (custom pool windows, share links
-- and passwords, chat agreement, under-age review, sport filter, live game
-- state, paid promotion, white-label tenancy, multi-provider payouts) and the
-- admin console that operates them (account status, admin roles, moderation,
-- reports, promotions review, platform settings, audit reasons, job health,
-- settlement reversal).
--
-- Every change is ADDITIVE. No column is dropped, renamed or narrowed, and
-- every new NOT NULL column carries a default, so the deployment that precedes
-- this schema keeps serving while it is applied — which is the order the
-- release runs in: migrate production first, then deploy the code that reads
-- the new columns.
--
-- Client roles get nothing they did not have before unless a section grants
-- it explicitly. New tables enable RLS immediately; the ones with no policy are
-- reached only through the service role from route handlers that check
-- identity, permission and reason themselves.
--
-- Idempotent. Safe on a fresh rebuild and on the live database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenants — the white-label hook the brief asked to design in now.
--
-- Nothing reads tenant_id yet. It exists so that when a second operator is
-- onboarded the work is "set the column", not "rewrite every money table".
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name                      text not null check (length(name) between 2 and 80),
  status                    text not null default 'active' check (status in ('active','suspended')),
  -- The operator's own keep on their pools; SportsPool's cut on top of it.
  platform_fee_percentage   numeric(5,2) not null default 10.00 check (platform_fee_percentage between 0 and 100),
  sportspool_cut_percentage numeric(5,2) not null default 2.00  check (sportspool_cut_percentage between 0 and 100),
  monthly_license_fee       numeric(12,2) check (monthly_license_fee is null or monthly_license_fee >= 0),
  branding                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
alter table public.tenants enable row level security;
drop policy if exists "Active tenants are public" on public.tenants;
create policy "Active tenants are public" on public.tenants
  for select using (status = 'active');
grant select (id, slug, name, status, branding) on public.tenants to anon, authenticated;

alter table public.pools             add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.users             add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.pool_transactions add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.payout_requests   add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
create index if not exists idx_pools_tenant             on public.pools(tenant_id)             where tenant_id is not null;
create index if not exists idx_users_tenant             on public.users(tenant_id)             where tenant_id is not null;
create index if not exists idx_pool_transactions_tenant on public.pool_transactions(tenant_id) where tenant_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Sport — stop hard-coding NFL. Everything defaults to 'nfl' so the
--    existing rows and the existing code keep meaning what they meant.
-- ---------------------------------------------------------------------------
alter table public.pools add column if not exists sport text not null default 'nfl'
  check (sport ~ '^[a-z0-9_]{2,20}$');
alter table public.games add column if not exists sport text not null default 'nfl'
  check (sport ~ '^[a-z0-9_]{2,20}$');
create index if not exists idx_pools_sport on public.pools(sport);

-- ---------------------------------------------------------------------------
-- 3. Custom pool window — owner-selectable, capped at seven days.
--
-- Additive to the week model rather than replacing it: the week still names
-- the slate the games come from; the window says when entry opens and closes.
-- Null on both means "the old behaviour" (open until the last game kicks off).
-- The cap is enforced here AND in the API, because a limit that only lives in
-- application code is a limit until the next client.
-- ---------------------------------------------------------------------------
alter table public.pools add column if not exists starts_at timestamptz;
alter table public.pools add column if not exists ends_at   timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pools_window_max_seven_days') then
    alter table public.pools add constraint pools_window_max_seven_days
      check (
        starts_at is null or ends_at is null
        or (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
      );
  end if;
end $$;
create index if not exists idx_pools_ends_at on public.pools(ends_at) where ends_at is not null;

-- ---------------------------------------------------------------------------
-- 4. Sharing and password access.
--
-- share_slug is the short public handle a link or QR code carries; it is
-- generated by trigger so no client ever chooses one. access_password_hash is
-- an scrypt hash written only by the API — the column is never granted to a
-- client role in either direction.
-- ---------------------------------------------------------------------------
alter table public.pools add column if not exists share_slug text;
alter table public.pools add column if not exists access_password_hash text;

create or replace function public.generate_share_slug()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No vowels, no 0/1/l: nothing a QR-scanning stranger can misread, and
  -- nothing that accidentally spells a word.
  alphabet constant text := 'bcdfghjkmnpqrstvwxyz23456789';
  out_slug text;
  attempt  integer := 0;
begin
  loop
    out_slug := '';
    for i in 1..10 loop
      out_slug := out_slug || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.pools where share_slug = out_slug);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not allocate a unique share slug';
    end if;
  end loop;
  return out_slug;
end $$;
revoke execute on function public.generate_share_slug() from public, anon, authenticated;

create or replace function public.set_pool_share_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_slug is null or new.share_slug = '' then
    new.share_slug := public.generate_share_slug();
  end if;
  return new;
end $$;
drop trigger if exists trg_set_pool_share_slug on public.pools;
create trigger trg_set_pool_share_slug
  before insert on public.pools
  for each row execute function public.set_pool_share_slug();

update public.pools set share_slug = public.generate_share_slug() where share_slug is null;
create unique index if not exists idx_pools_share_slug on public.pools(share_slug);
grant select (share_slug, sport, starts_at, ends_at, tenant_id) on public.pools to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pool status provenance. Statuses gain 'paused' and 'cancelled' (the
--    column has no check constraint; the application enums own the vocabulary).
--    Every status change an admin makes records why and by whom.
-- ---------------------------------------------------------------------------
alter table public.pools add column if not exists status_reason     text;
alter table public.pools add column if not exists status_changed_at timestamptz;
alter table public.pools add column if not exists status_changed_by uuid references public.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. Live game state, captured from the ESPN situation block on every sync,
--    for the live-stats panel and the admin games screen.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists period         integer check (period is null or period between 0 and 9);
alter table public.games add column if not exists display_clock  text;
alter table public.games add column if not exists possession     text;
alter table public.games add column if not exists down_distance  text;
alter table public.games add column if not exists yard_line      integer check (yard_line is null or yard_line between 0 and 100);
alter table public.games add column if not exists is_red_zone    boolean not null default false;
alter table public.games add column if not exists last_synced_at timestamptz;
alter table public.games add column if not exists data_source    text not null default 'espn';

-- ---------------------------------------------------------------------------
-- 7. system_jobs — one row per scheduled job, overwritten on every run.
--
-- This is the entire extent of "job history": the last outcome. The admin
-- dashboard's "failed jobs / last sync" tiles read it. Deliberately NOT an
-- event log.
-- ---------------------------------------------------------------------------
create table if not exists public.system_jobs (
  job              text primary key,
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_success_at  timestamptz,
  last_status      text check (last_status in ('ok','error','running')),
  last_error       text,
  last_detail      jsonb,
  updated_at       timestamptz not null default now()
);
alter table public.system_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- 8. Account status and admin roles on users.
--
-- account_status is enforced at signin, at every money boundary and at chat
-- posting. admin_role narrows an admin (users.role = 'admin') to a permission
-- set; an admin with no admin_role is a super admin, which keeps every
-- existing admin exactly as capable as they were.
--
-- users carries COLUMN-level client grants (20260811). New columns are
-- therefore not client-writable by construction; the revoke below is belt and
-- braces, and the select grant exposes only what a user may see about
-- themselves through the own-row policy.
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists account_status    text not null default 'active'
  check (account_status in ('active','blocked','suspended'));
alter table public.users add column if not exists status_reason     text;
alter table public.users add column if not exists status_changed_at timestamptz;
alter table public.users add column if not exists status_changed_by uuid references public.users(id) on delete set null;
alter table public.users add column if not exists suspended_until   timestamptz;
alter table public.users add column if not exists admin_role        text
  check (admin_role is null or admin_role in ('super_admin','finance_admin','operations_admin','support_admin','moderator'));
alter table public.users add column if not exists admin_note        text;
alter table public.users add column if not exists last_active_at    timestamptz;

revoke update (account_status, status_reason, status_changed_at, status_changed_by, suspended_until, admin_role, admin_note, tenant_id, last_active_at)
  on public.users from anon, authenticated;
revoke insert (account_status, status_reason, status_changed_at, status_changed_by, suspended_until, admin_role, admin_note, tenant_id, last_active_at)
  on public.users from anon, authenticated;
grant select (account_status, suspended_until, admin_role, last_active_at) on public.users to authenticated;
create index if not exists idx_users_account_status on public.users(account_status) where account_status <> 'active';
create index if not exists idx_users_admin_role     on public.users(admin_role)     where admin_role is not null;

-- ---------------------------------------------------------------------------
-- 9. Under-age review.
--
-- Two places, because there are two populations:
--   user_compliance.age_review_* — an EXISTING account the gate found under
--     the local minimum at a money boundary (18-20 in a 21+ state).
--   blocked_signups — an address that was refused at SIGNUP. No account
--     exists, so the record lives on its own; approving it lifts the block
--     for that address and nothing else.
-- ---------------------------------------------------------------------------
alter table public.user_compliance add column if not exists age_review_status text not null default 'none'
  check (age_review_status in ('none','pending','approved','rejected'));
alter table public.user_compliance add column if not exists age_review_reason text;
alter table public.user_compliance add column if not exists age_reviewed_by   uuid references public.users(id) on delete set null;
alter table public.user_compliance add column if not exists age_reviewed_at   timestamptz;
alter table public.user_compliance add column if not exists age_review_note   text;
create index if not exists idx_user_compliance_age_review on public.user_compliance(age_review_status) where age_review_status <> 'none';

create table if not exists public.blocked_signups (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  email_key       text generated always as (lower(btrim(email))) stored,
  date_of_birth   date,
  computed_age    integer,
  minimum_age     integer,
  country_code    text,
  region_code     text,
  reason          text not null default 'under_minimum_age',
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  attempts        integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now()
);
create unique index if not exists idx_blocked_signups_email_key on public.blocked_signups(email_key);
create index if not exists idx_blocked_signups_status on public.blocked_signups(status);
alter table public.blocked_signups enable row level security;

-- ---------------------------------------------------------------------------
-- 10. Chat: agreement gate, per-game threads, moderation state.
--
-- A hidden or deleted comment must be invisible AT THE RLS LAYER to players,
-- not merely filtered by the route — the brief's "at the database level"
-- requirement applies to moderation as much as to cards. The read policy is
-- therefore rewritten to require visibility unless the reader is an admin.
-- ---------------------------------------------------------------------------
alter table public.comments add column if not exists moderation_status text not null default 'visible'
  check (moderation_status in ('visible','hidden','flagged','deleted'));
alter table public.comments add column if not exists moderated_by      uuid references public.users(id) on delete set null;
alter table public.comments add column if not exists moderated_at      timestamptz;
alter table public.comments add column if not exists moderation_reason text;
alter table public.comments add column if not exists game_id           text references public.games(id) on delete set null;
create index if not exists idx_comments_moderation on public.comments(moderation_status) where moderation_status <> 'visible';
create index if not exists idx_comments_game       on public.comments(game_id) where game_id is not null;

grant select (moderation_status, game_id) on public.comments to anon, authenticated;
grant insert (game_id) on public.comments to authenticated;

drop policy if exists "Chat readable by card holders" on public.comments;
create policy "Chat readable by card holders" on public.comments
  for select using (
    private.is_admin()
    or (
      moderation_status = 'visible'
      and (
        exists (select 1 from public.parlay_cards c
                where c.pool_id = comments.pool_id and c.user_id = (select auth.uid()))
        or exists (select 1 from public.pool_participants pp
                   where pp.pool_id = comments.pool_id and pp.user_id = (select auth.uid()))
      )
    )
  );

alter table public.user_compliance add column if not exists chat_rules_accepted_at timestamptz;
alter table public.user_compliance add column if not exists chat_rules_version     text;

-- ---------------------------------------------------------------------------
-- 11. Content reports — a player flags a comment; a moderator resolves it.
--
-- Players may insert their own report and read their own reports. Everything
-- else is the moderation console through the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid references public.users(id) on delete set null,
  comment_id       uuid references public.comments(id) on delete set null,
  pool_id          uuid references public.pools(id) on delete set null,
  reason           text not null check (length(btrim(reason)) between 3 and 500),
  status           text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  action_taken     text,
  resolved_by      uuid references public.users(id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now()
);
create unique index if not exists idx_content_reports_once_per_comment
  on public.content_reports(reporter_id, comment_id) where comment_id is not null;
create index if not exists idx_content_reports_status on public.content_reports(status, created_at desc);
alter table public.content_reports enable row level security;
drop policy if exists "Report own" on public.content_reports;
create policy "Report own" on public.content_reports
  for insert with check (reporter_id = (select auth.uid()) and status = 'pending');
drop policy if exists "See own reports" on public.content_reports;
create policy "See own reports" on public.content_reports
  for select using (reporter_id = (select auth.uid()) or private.is_admin());
grant select on public.content_reports to authenticated;
grant insert (reporter_id, reported_user_id, comment_id, pool_id, reason) on public.content_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Pool promotions — paid placement, modelled before the price is known.
--
-- pricing_model, amount and placement are data, not schema, so the client can
-- move from "flat fee" to "tiered" or "auction" by changing rows. Money for a
-- promotion is not collected yet (pricing TBD); when it is, payment_provider /
-- payment_reference / paid_at are where it lands.
-- ---------------------------------------------------------------------------
create table if not exists public.pool_promotions (
  id                uuid primary key default gen_random_uuid(),
  pool_id           uuid not null references public.pools(id) on delete cascade,
  requested_by      uuid references public.users(id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending','approved','active','paused','rejected','cancelled','expired')),
  placement         text not null default 'featured' check (placement in ('featured','boosted','spotlight')),
  pricing_model     text not null default 'flat' check (pricing_model in ('flat','tiered','auction','complimentary')),
  amount            numeric(12,2) not null default 0 check (amount >= 0),
  currency          text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_provider  text,
  payment_reference text,
  paid_at           timestamptz,
  starts_at         timestamptz,
  ends_at           timestamptz,
  approved_by       uuid references public.users(id) on delete set null,
  approved_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists idx_pool_promotions_pool   on public.pool_promotions(pool_id);
create index if not exists idx_pool_promotions_window on public.pool_promotions(status, starts_at, ends_at);
alter table public.pool_promotions enable row level security;
drop policy if exists "Owners see own promotions" on public.pool_promotions;
create policy "Owners see own promotions" on public.pool_promotions
  for select using (requested_by = (select auth.uid()) or private.is_admin());
grant select on public.pool_promotions to authenticated;

-- ---------------------------------------------------------------------------
-- 13. Platform settings — everything the admin settings screen edits.
--     Public-safe columns are readable by everyone (the app renders the brand
--     and the chat rules from them); the rest is service-role only.
-- ---------------------------------------------------------------------------
alter table public.platform_settings add column if not exists platform_name          text not null default 'SportsPool';
alter table public.platform_settings add column if not exists contact_email          text;
alter table public.platform_settings add column if not exists support_email          text;
alter table public.platform_settings add column if not exists logo_url               text;
alter table public.platform_settings add column if not exists max_pool_duration_days integer not null default 7
  check (max_pool_duration_days between 1 and 7);
alter table public.platform_settings add column if not exists supported_sports       text[] not null default '{nfl}';
alter table public.platform_settings add column if not exists maintenance_mode       boolean not null default false;
alter table public.platform_settings add column if not exists feature_flags          jsonb not null default '{}'::jsonb;
alter table public.platform_settings add column if not exists brand_primary_color    text not null default '#0047AB'
  check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.platform_settings add column if not exists brand_accent_color     text not null default '#D7263D'
  check (brand_accent_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.platform_settings add column if not exists chat_rules_version     text not null default '2026-09-06';
alter table public.platform_settings add column if not exists chat_slow_mode_seconds integer not null default 10
  check (chat_slow_mode_seconds between 0 and 3600);
grant select (platform_name, contact_email, support_email, logo_url, max_pool_duration_days, supported_sports,
              maintenance_mode, brand_primary_color, brand_accent_color, chat_rules_version, chat_slow_mode_seconds)
  on public.platform_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 14. Withdrawals — provider and review provenance.
--     Status vocabulary (application-owned): pending, approved, on_hold,
--     processing, completed, failed, rejected, cancelled.
-- ---------------------------------------------------------------------------
alter table public.payout_requests add column if not exists provider           text not null default 'paypal'
  check (provider in ('paypal','revolut','bank_transfer','manual'));
alter table public.payout_requests add column if not exists provider_reference text;
alter table public.payout_requests add column if not exists failure_reason     text;
alter table public.payout_requests add column if not exists review_reason      text;
alter table public.payout_requests add column if not exists reviewed_by        uuid references public.users(id) on delete set null;
alter table public.payout_requests add column if not exists reviewed_at        timestamptz;
alter table public.payout_requests add column if not exists retry_count        integer not null default 0 check (retry_count >= 0);
create index if not exists idx_payout_requests_status on public.payout_requests(status, created_at desc);
revoke update (provider, provider_reference, failure_reason, review_reason, reviewed_by, reviewed_at, retry_count)
  on public.payout_requests from anon, authenticated;

-- user_payout_accounts: allow the methods the brief names. The API still
-- decides which are live; this only stops the schema refusing them.
alter table public.user_payout_accounts drop constraint if exists user_payout_accounts_method_check;
alter table public.user_payout_accounts add constraint user_payout_accounts_method_check
  check (method in ('paypal','revolut','bank_transfer'));

-- ---------------------------------------------------------------------------
-- 15. Entry-fee refunds — a cancelled pool marks its paid rows refund_required;
--     the refund itself is performed in Stripe by an admin and recorded here.
-- ---------------------------------------------------------------------------
alter table public.pool_transactions add column if not exists refund_status    text not null default 'none'
  check (refund_status in ('none','refund_required','refunded'));
alter table public.pool_transactions add column if not exists refund_reference text;
alter table public.pool_transactions add column if not exists refunded_at      timestamptz;
alter table public.pool_transactions add column if not exists refund_reason    text;
alter table public.pool_transactions add column if not exists refunded_by      uuid references public.users(id) on delete set null;
create index if not exists idx_pool_transactions_refund on public.pool_transactions(refund_status) where refund_status <> 'none';

-- ---------------------------------------------------------------------------
-- 16. Audit record — add the reason. Every consequential admin action now
--     carries one; the table stays the lightweight, action-only record it was.
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log add column if not exists reason text;
create index if not exists idx_admin_audit_created on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_actor   on public.admin_audit_log(actor_id, created_at desc);
create index if not exists idx_admin_audit_target  on public.admin_audit_log(target_type, target_id);

-- ---------------------------------------------------------------------------
-- 17. Settlement reversal — the controlled override behind "recalculate".
--
-- materializePoolWinners refuses to run on a pool that has winners or credits,
-- for a good reason (it would pay the pot twice). Recalculation therefore
-- needs a reversal that puts the money back FIRST, atomically, and refuses
-- outright if any of it has already left the platform.
--
-- The original credit rows are RETYPED, not deleted: the partial unique index
-- idx_user_transactions_winning_per_pool only admits one winning_approved row
-- per (user, pool), and the ledger must keep showing that a credit happened
-- and was reversed. The compensating debit is its own row.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reverse_pool_settlement(
  p_pool_id uuid,
  p_actor   uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r             record;
  v_balance     numeric;
  v_reversed    integer := 0;
  v_total       numeric := 0;
  v_withdrawn   integer;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required';
  end if;
  if not exists (select 1 from public.pools where id = p_pool_id) then
    raise exception 'pool % not found', p_pool_id;
  end if;

  -- Money that has already left cannot be pulled back by a ledger entry.
  select count(*) into v_withdrawn
  from public.payout_requests
  where pool_id = p_pool_id and status in ('approved','processing','completed');
  if v_withdrawn > 0 then
    raise exception 'pool has % withdrawal(s) already approved or paid; reversal refused', v_withdrawn;
  end if;

  for r in
    select id, user_id, amount
    from public.user_transactions
    where pool_id = p_pool_id and type = 'winning_approved'
    for update
  loop
    select balance into v_balance from public.users where id = r.user_id for update;
    if v_balance is null or v_balance < r.amount then
      raise exception 'user % holds % but the credit was %; reversal refused', r.user_id, coalesce(v_balance,0), r.amount;
    end if;

    update public.users set balance = balance - r.amount where id = r.user_id;

    insert into public.user_transactions
      (user_id, admin_id, previous_balance, amount, final_balance, type, reference_type, reference_id, pool_id, comment)
    values
      (r.user_id, p_actor, v_balance, -r.amount, v_balance - r.amount, 'winning_reversed', 'settlement_reversal', r.id, p_pool_id, p_reason);

    update public.user_transactions set type = 'winning_approved_reversed' where id = r.id;

    v_reversed := v_reversed + 1;
    v_total    := v_total + r.amount;
  end loop;

  delete from public.payout_approvals where pool_id = p_pool_id;
  delete from public.pool_winners     where pool_id = p_pool_id;

  return jsonb_build_object('reversed_credits', v_reversed, 'amount_reversed', v_total);
end $$;
revoke execute on function public.admin_reverse_pool_settlement(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.admin_reverse_pool_settlement(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 18. Dashboard overview — one round trip for the tiles. Service-role only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview_stats()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',        (select count(*) from public.users),
      'active',       (select count(*) from public.users where account_status = 'active'),
      'new_7d',       (select count(*) from public.users where created_at > now() - interval '7 days'),
      'blocked',      (select count(*) from public.users where account_status = 'blocked'),
      'suspended',    (select count(*) from public.users where account_status = 'suspended'),
      'age_review',   (select count(*) from public.user_compliance where age_review_status = 'pending')
                    + (select count(*) from public.blocked_signups where status = 'pending')
    ),
    'pools', jsonb_build_object(
      'total',     (select count(*) from public.pools),
      'active',    (select count(*) from public.pools where status = 'active'),
      'upcoming',  (select count(*) from public.pools where status = 'open'),
      'paused',    (select count(*) from public.pools where status = 'paused'),
      'completed', (select count(*) from public.pools where status = 'completed'),
      'cancelled', (select count(*) from public.pools where status = 'cancelled')
    ),
    'finance', jsonb_build_object(
      'entry_fees',          coalesce((select sum(amount) from public.pool_transactions where status = 'completed' and refund_status <> 'refunded'), 0),
      'platform_fees',       coalesce((select sum(platform_fee) from public.pool_transactions where status = 'completed' and refund_status <> 'refunded'), 0),
      'pending_withdrawals', coalesce((select sum(amount) from public.payout_requests where status in ('pending','approved','on_hold')), 0),
      'pending_withdrawal_count', (select count(*) from public.payout_requests where status in ('pending','approved','on_hold')),
      'completed_payouts',   coalesce((select sum(amount) from public.payout_requests where status = 'completed'), 0),
      'failed_payouts',      (select count(*) from public.payout_requests where status = 'failed'),
      'refunds_required',    (select count(*) from public.pool_transactions where refund_status = 'refund_required')
    ),
    'games', jsonb_build_object(
      'live',      (select count(*) from public.games where status = 'live'),
      'upcoming',  (select count(*) from public.games where status = 'scheduled' and date > now()),
      'completed', (select count(*) from public.games where status = 'finished'),
      'last_sync', (select max(last_synced_at) from public.games)
    ),
    'moderation', jsonb_build_object(
      'flagged_comments', (select count(*) from public.comments where moderation_status = 'flagged'),
      'hidden_comments',  (select count(*) from public.comments where moderation_status = 'hidden'),
      'open_reports',     (select count(*) from public.content_reports where status = 'pending'),
      'suspended_users',  (select count(*) from public.users where account_status = 'suspended')
    ),
    'promotions', jsonb_build_object(
      'pending', (select count(*) from public.pool_promotions where status = 'pending'),
      'active',  (select count(*) from public.pool_promotions where status = 'active')
    ),
    'system', jsonb_build_object(
      'jobs',              (select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) from public.system_jobs j),
      'failed_jobs',       (select count(*) from public.system_jobs where last_status = 'error'),
      'webhook_failures_24h', (select count(*) from public.app_errors where url = '/api/stripe/webhook' and created_at > now() - interval '24 hours'),
      'errors_24h',        (select count(*) from public.app_errors where created_at > now() - interval '24 hours')
    ),
    'generated_at', now()
  );
$$;
revoke execute on function public.admin_overview_stats() from public, anon, authenticated;
grant  execute on function public.admin_overview_stats() to service_role;

-- ---------------------------------------------------------------------------
-- 19. updated_at maintenance for the new tables (reuses the existing trigger fn).
-- ---------------------------------------------------------------------------
drop trigger if exists update_tenants_updated_at on public.tenants;
create trigger update_tenants_updated_at before update on public.tenants
  for each row execute function public.update_updated_at_column();
drop trigger if exists update_pool_promotions_updated_at on public.pool_promotions;
create trigger update_pool_promotions_updated_at before update on public.pool_promotions
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 20. Notes for the operator (comments on the catalogue, so they survive).
-- ---------------------------------------------------------------------------
comment on column public.pools.ends_at is
  'Entry window close. Purchases refuse after this; settlement completes the pool once every game is final. Max 7 days after starts_at.';
comment on column public.users.account_status is
  'active | blocked | suspended. Enforced at signin, every money boundary and chat posting. Changed only by admin routes that record a reason.';
comment on table public.blocked_signups is
  'Addresses refused at signup for age. Approving lifts the block for that address only; the user still enters a date of birth that must pass.';
comment on table public.system_jobs is
  'Last outcome per scheduled job. Overwritten every run; not a history.';
comment on function public.admin_reverse_pool_settlement(uuid, uuid, text) is
  'Reverse winner credits for a pool so it can be re-scored. Refuses if any winnings were withdrawn. Service role only.';
