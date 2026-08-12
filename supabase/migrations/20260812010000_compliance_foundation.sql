-- ============================================================================
-- REGULATORY COMPLIANCE FOUNDATION
--
-- Audit section 9.F asked ten questions that code alone cannot answer. This
-- migration builds the machinery that ENFORCES the answers, so that when
-- counsel rules on a jurisdiction the change is a row update rather than a
-- redeploy. It covers:
--
--   1. jurisdiction_rules   — which territories may play, and at what age
--   2. compliance_settings  — operator-tunable thresholds (singleton)
--   3. user_compliance      — per-user age, KYC, tax and self-exclusion state
--   4. compliance_events    — immutable record of every compliance decision
--   5. admin_audit_log      — attributable trail for privileged actions (9.B)
--   6. tax reporting view   — annual winnings aggregation per user
--
-- DESIGN PRINCIPLE — the client is never trusted and never authoritative.
-- user_compliance carries NO client UPDATE grant at all. Every mutation goes
-- through a SECURITY DEFINER RPC that derives identity from auth.uid(), so a
-- user cannot lift their own self-exclusion, back-date their age, or raise
-- their own deposit limit without the mandated cooling-off. This is the same
-- lesson the users.balance grants taught: RLS cannot restrict WHICH columns an
-- UPDATE touches, so the write path itself must be the control.
--
-- Idempotent. Safe on a fresh rebuild and on the live database.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. jurisdiction_rules
--
-- region_code uses '*' rather than NULL for "the whole country", because NULLs
-- compare as distinct in a UNIQUE constraint and would let duplicate
-- country-wide rows accumulate silently.
--
-- Resolution order is most-specific-first: (country, region) then (country,'*')
-- then the default in compliance_settings. That is implemented in
-- src/lib/compliance/jurisdiction.ts and pinned by unit tests.
-- ---------------------------------------------------------------------------
create table if not exists public.jurisdiction_rules (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  region_code   text not null default '*',
  status        text not null check (status in ('allowed', 'blocked', 'review')),
  minimum_age   integer not null default 18 check (minimum_age between 18 and 25),
  requires_license boolean not null default false,
  notes         text,
  updated_by    uuid references public.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (country_code, region_code)
);

comment on table public.jurisdiction_rules is
  'Where the platform may operate and at what minimum age. Seeded with a '
  'conservative starter set modelled on the exclusion lists paid fantasy '
  'operators commonly use. THIS IS NOT LEGAL ADVICE — counsel must confirm '
  'every row before launch. status=review behaves as blocked at money '
  'boundaries but is distinguishable in reporting.';

-- ---------------------------------------------------------------------------
-- 2. compliance_settings — singleton, operator-tunable
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_settings (
  id                        boolean primary key default true check (id),
  geo_enforcement_enabled   boolean not null default true,
  default_jurisdiction_status text not null default 'allowed'
                              check (default_jurisdiction_status in ('allowed','blocked','review')),
  default_minimum_age       integer not null default 18 check (default_minimum_age between 18 and 25),
  -- Cumulative payout in a rolling 12 months above which KYC must be complete
  -- before another payout is released.
  kyc_payout_threshold      numeric(12,2) not null default 600.00,
  -- US 1099-MISC information-reporting threshold for prizes and awards.
  tax_reporting_threshold   numeric(12,2) not null default 600.00,
  -- Hours an increase to a self-imposed deposit limit must wait before taking
  -- effect. Decreases are always immediate. Industry standard is 24h.
  limit_increase_delay_hours integer not null default 24 check (limit_increase_delay_hours >= 0),
  current_tos_version       text not null default '2026-08-12',
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.users(id) on delete set null
);

insert into public.compliance_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. user_compliance
--
-- One row per user, created at signup. No client UPDATE grant — see the design
-- note at the top of this file.
-- ---------------------------------------------------------------------------
create table if not exists public.user_compliance (
  user_id              uuid primary key references public.users(id) on delete cascade,

  -- Age. date_of_birth is collected once and never client-updatable; age is
  -- recomputed at each money boundary rather than trusting a stored flag.
  date_of_birth        date,
  age_verified_at      timestamptz,

  -- Where the account was opened, captured from edge geo headers at signup.
  registration_country text check (registration_country is null or registration_country ~ '^[A-Z]{2}$'),
  registration_region  text,

  -- Terms acceptance, versioned so a terms change can require re-acceptance.
  tos_accepted_at      timestamptz,
  tos_version          text,

  -- KYC. 'none' until a payout crosses the threshold; 'pending' once the user
  -- has submitted; admin moves it to verified/rejected.
  kyc_status           text not null default 'none'
                         check (kyc_status in ('none','pending','verified','rejected')),
  kyc_verified_at      timestamptz,
  kyc_reviewed_by      uuid references public.users(id) on delete set null,
  kyc_notes            text,

  -- Tax identity. The raw TIN is deliberately NOT stored: holding it creates
  -- breach liability out of proportion to its use here. Only the collection
  -- status and last four digits are kept, which is enough to prove collection
  -- and to reconcile against the filing agent's records.
  tax_id_status        text not null default 'none'
                         check (tax_id_status in ('none','collected','exempt')),
  tax_id_last4         text check (tax_id_last4 is null or tax_id_last4 ~ '^[0-9]{4}$'),
  tax_id_collected_at  timestamptz,

  -- Responsible gambling.
  self_excluded_until  timestamptz,
  self_excluded_at     timestamptz,
  cooling_off_until    timestamptz,
  deposit_limit_daily    numeric(12,2) check (deposit_limit_daily is null or deposit_limit_daily >= 0),
  deposit_limit_weekly   numeric(12,2) check (deposit_limit_weekly is null or deposit_limit_weekly >= 0),
  deposit_limit_monthly  numeric(12,2) check (deposit_limit_monthly is null or deposit_limit_monthly >= 0),
  -- Pending INCREASES wait out limit_increase_delay_hours before applying.
  pending_limit_daily    numeric(12,2),
  pending_limit_weekly   numeric(12,2),
  pending_limit_monthly  numeric(12,2),
  pending_limits_effective_at timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_user_compliance_self_excluded
  on public.user_compliance (self_excluded_until)
  where self_excluded_until is not null;
create index if not exists idx_user_compliance_kyc_status
  on public.user_compliance (kyc_status);

-- ---------------------------------------------------------------------------
-- 4. compliance_events — why a decision was made, kept for the regulator
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  event_type  text not null,
  decision    text check (decision in ('allowed','blocked')),
  reason      text,
  country_code text,
  region_code  text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_compliance_events_user
  on public.compliance_events (user_id, created_at desc);
create index if not exists idx_compliance_events_created
  on public.compliance_events (created_at desc);

comment on table public.compliance_events is
  'Immutable record of every compliance decision (age, geo, self-exclusion, '
  'limits, KYC). Service-role write only. Retained 7 years — this is the '
  'evidence trail a regulator or a disputing player will ask for.';

-- ---------------------------------------------------------------------------
-- 5. admin_audit_log — audit finding 9.B
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  before_state jsonb,
  after_state  jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created
  on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_actor
  on public.admin_audit_log (actor_id, created_at desc);

comment on table public.admin_audit_log is
  'Attributable trail for privileged actions: role changes, payout '
  'completions, platform-fee edits, KYC decisions. Financial disputes are '
  'resolved from this table.';

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read-own for the user-facing tables so a player can see their own state.
-- NO client write grants anywhere — every mutation is an RPC or service role.
-- ---------------------------------------------------------------------------
alter table public.jurisdiction_rules  enable row level security;
alter table public.compliance_settings enable row level security;
alter table public.user_compliance     enable row level security;
alter table public.compliance_events   enable row level security;
alter table public.admin_audit_log     enable row level security;

revoke all on public.user_compliance     from public, anon, authenticated;
revoke all on public.compliance_events   from public, anon, authenticated;
revoke all on public.admin_audit_log     from public, anon, authenticated;
revoke all on public.jurisdiction_rules  from public, anon, authenticated;
revoke all on public.compliance_settings from public, anon, authenticated;

-- A user may read their own compliance state (the RG settings screen needs it).
grant select on public.user_compliance to authenticated;
drop policy if exists "Users can view own compliance state" on public.user_compliance;
create policy "Users can view own compliance state" on public.user_compliance
  for select using (((select auth.uid()) = user_id) or private.is_admin());

-- Admins read the audit trails; nobody else does, and nobody writes via the API.
grant select on public.compliance_events to authenticated;
drop policy if exists "Admins read compliance events" on public.compliance_events;
create policy "Admins read compliance events" on public.compliance_events
  for select using (private.is_admin());

grant select on public.admin_audit_log to authenticated;
drop policy if exists "Admins read admin audit log" on public.admin_audit_log;
create policy "Admins read admin audit log" on public.admin_audit_log
  for select using (private.is_admin());

-- Jurisdiction rules are readable by signed-in clients so the UI can explain a
-- block ("not available in your state") without a round trip through an admin.
-- They carry no user data. Writes remain service-role only.
grant select on public.jurisdiction_rules to authenticated, anon;
drop policy if exists "Anyone may read jurisdiction rules" on public.jurisdiction_rules;
create policy "Anyone may read jurisdiction rules" on public.jurisdiction_rules
  for select using (true);

grant select on public.compliance_settings to authenticated;
drop policy if exists "Signed-in users read compliance settings" on public.compliance_settings;
create policy "Signed-in users read compliance settings" on public.compliance_settings
  for select using (true);

-- ---------------------------------------------------------------------------
-- 6. Write RPCs — the only client path into user_compliance
-- ---------------------------------------------------------------------------

-- Self-exclusion. Can only ever EXTEND: greatest() of the existing and the new
-- date. A user in crisis must not be able to undo this by replaying the call
-- with a shorter period, and support must not be able to either without an
-- explicit admin action that lands in admin_audit_log.
create or replace function public.set_self_exclusion(p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_until timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Exclusion period must be between 1 and 3650 days'
      using errcode = '22023';
  end if;

  v_until := now() + make_interval(days => p_days);

  insert into public.user_compliance (user_id, self_excluded_until, self_excluded_at)
  values (v_user, v_until, now())
  on conflict (user_id) do update
    set self_excluded_until = greatest(
          coalesce(public.user_compliance.self_excluded_until, v_until), v_until),
        self_excluded_at = coalesce(public.user_compliance.self_excluded_at, now()),
        updated_at = now()
  returning self_excluded_until into v_until;

  insert into public.compliance_events (user_id, event_type, decision, reason, detail)
  values (v_user, 'self_exclusion_set', 'allowed', 'User requested self-exclusion',
          jsonb_build_object('days', p_days, 'until', v_until));

  return v_until;
end;
$$;

-- Deposit limits. Decreasing protects the user, so it applies at once.
-- Increasing removes a protection, so it waits out the configured delay —
-- otherwise the control is decorative: a user could lower a limit, hit it, and
-- raise it again in the same session.
create or replace function public.set_deposit_limits(
  p_daily numeric, p_weekly numeric, p_monthly numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_delay integer;
  v_cur public.user_compliance%rowtype;
  v_immediate boolean;
  v_effective timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if (p_daily is not null and p_daily < 0)
     or (p_weekly is not null and p_weekly < 0)
     or (p_monthly is not null and p_monthly < 0) then
    raise exception 'Limits cannot be negative' using errcode = '22023';
  end if;

  select limit_increase_delay_hours into v_delay from public.compliance_settings where id;

  insert into public.user_compliance (user_id) values (v_user)
    on conflict (user_id) do nothing;
  select * into v_cur from public.user_compliance where user_id = v_user;

  -- An unset limit is "no limit", i.e. infinity — so moving from NULL to a
  -- number is a DECREASE and applies immediately, while moving to NULL is an
  -- increase and must wait.
  v_immediate :=
        coalesce(p_daily,   'infinity') <= coalesce(v_cur.deposit_limit_daily,   'infinity')
    and coalesce(p_weekly,  'infinity') <= coalesce(v_cur.deposit_limit_weekly,  'infinity')
    and coalesce(p_monthly, 'infinity') <= coalesce(v_cur.deposit_limit_monthly, 'infinity');

  if v_immediate then
    update public.user_compliance
       set deposit_limit_daily = p_daily,
           deposit_limit_weekly = p_weekly,
           deposit_limit_monthly = p_monthly,
           pending_limit_daily = null,
           pending_limit_weekly = null,
           pending_limit_monthly = null,
           pending_limits_effective_at = null,
           updated_at = now()
     where user_id = v_user;
    v_effective := now();
  else
    v_effective := now() + make_interval(hours => v_delay);
    update public.user_compliance
       set pending_limit_daily = p_daily,
           pending_limit_weekly = p_weekly,
           pending_limit_monthly = p_monthly,
           pending_limits_effective_at = v_effective,
           updated_at = now()
     where user_id = v_user;
  end if;

  insert into public.compliance_events (user_id, event_type, decision, reason, detail)
  values (v_user, 'deposit_limits_set', 'allowed',
          case when v_immediate then 'Decrease applied immediately'
               else 'Increase scheduled after cooling-off' end,
          jsonb_build_object('daily', p_daily, 'weekly', p_weekly,
                             'monthly', p_monthly, 'effective_at', v_effective));

  return jsonb_build_object('immediate', v_immediate, 'effective_at', v_effective);
end;
$$;

-- Promote any pending limit increase whose delay has elapsed. Called by the
-- compliance evaluator before it reads limits, so the promotion happens
-- without a scheduled job.
create or replace function public.apply_due_limit_increases(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.user_compliance
     set deposit_limit_daily = pending_limit_daily,
         deposit_limit_weekly = pending_limit_weekly,
         deposit_limit_monthly = pending_limit_monthly,
         pending_limit_daily = null,
         pending_limit_weekly = null,
         pending_limit_monthly = null,
         pending_limits_effective_at = null,
         updated_at = now()
   where user_id = p_user_id
     and pending_limits_effective_at is not null
     and pending_limits_effective_at <= now();
end;
$$;

-- Terms acceptance.
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  insert into public.user_compliance (user_id, tos_accepted_at, tos_version)
  values (v_user, now(), p_version)
  on conflict (user_id) do update
    set tos_accepted_at = now(), tos_version = p_version, updated_at = now();

  insert into public.compliance_events (user_id, event_type, decision, detail)
  values (v_user, 'tos_accepted', 'allowed', jsonb_build_object('version', p_version));
end;
$$;

revoke all on function public.set_self_exclusion(integer) from public, anon;
revoke all on function public.set_deposit_limits(numeric, numeric, numeric) from public, anon;
revoke all on function public.accept_terms(text) from public, anon;
revoke all on function public.apply_due_limit_increases(uuid) from public, anon, authenticated;
grant execute on function public.set_self_exclusion(integer) to authenticated;
grant execute on function public.set_deposit_limits(numeric, numeric, numeric) to authenticated;
grant execute on function public.accept_terms(text) to authenticated;

comment on function public.set_self_exclusion(integer) is
  'SECURITY DEFINER by design: identity comes from auth.uid(), and the '
  'greatest() guard means a self-exclusion can only ever be extended.';
comment on function public.set_deposit_limits(numeric, numeric, numeric) is
  'SECURITY DEFINER by design: decreases apply immediately, increases wait out '
  'compliance_settings.limit_increase_delay_hours so the control is not '
  'trivially reversible in-session.';

-- ---------------------------------------------------------------------------
-- 7. Tax reporting aggregation
--
-- A view rather than a table: derived from the ledger, so it cannot drift from
-- the transactions it summarises.
-- ---------------------------------------------------------------------------
create or replace view public.user_tax_year_summary
with (security_invoker = true)
as
select
  ut.user_id,
  extract(year from ut.created_at)::int as tax_year,
  sum(ut.amount) filter (where ut.amount > 0) as gross_winnings,
  count(*) filter (where ut.amount > 0)       as credit_count,
  max(ut.created_at)                          as last_credit_at
from public.user_transactions ut
where ut.type in ('payout', 'winnings', 'credit')
group by ut.user_id, extract(year from ut.created_at);

comment on view public.user_tax_year_summary is
  'Gross winnings per user per calendar year, for information-reporting '
  'thresholds (US 1099-MISC is 600.00). security_invoker so the caller''s RLS '
  'on user_transactions applies — a user sees only their own row.';

-- ---------------------------------------------------------------------------
-- 8. Seed jurisdiction rules
--
-- ⚠ NOT LEGAL ADVICE. This is a conservative starting position modelled on the
-- exclusion lists paid fantasy-sports operators have commonly used in the US.
-- Rules are seeded as 'review' rather than 'blocked' so the distinction between
-- "counsel said no" and "nobody has looked yet" stays visible in reporting —
-- both refuse money at the boundary, only one of them is a decision.
-- ---------------------------------------------------------------------------
insert into public.jurisdiction_rules (country_code, region_code, status, minimum_age, notes)
values
  ('US','WA','review',18,'Commonly excluded by paid fantasy operators — confirm with counsel'),
  ('US','ID','review',18,'Commonly excluded by paid fantasy operators — confirm with counsel'),
  ('US','MT','review',18,'Commonly excluded by paid fantasy operators — confirm with counsel'),
  ('US','NV','review',21,'Gaming-licensed state — confirm licensing position with counsel'),
  ('US','AZ','review',21,'Confirm current position with counsel'),
  ('US','HI','review',18,'Commonly excluded by paid fantasy operators — confirm with counsel'),
  ('US','AL','review',19,'Confirm current position and age of majority with counsel'),
  ('US','IA','review',21,'Confirm current position with counsel'),
  ('US','LA','review',21,'Parish-level variation — confirm with counsel'),
  ('US','MS','review',21,'Confirm current position with counsel'),
  ('US','MO','review',18,'Confirm current position with counsel'),
  ('US','TN','review',18,'Confirm current position with counsel'),
  ('US','NE','review',19,'Confirm current position and age of majority with counsel'),
  ('US','*' ,'allowed',18,'Default for US states not listed — confirm with counsel'),
  ('CA','*' ,'review',18,'Provincial variation — confirm with counsel'),
  ('GB','*' ,'review',18,'Gambling Commission licensing likely applies — confirm with counsel'),
  ('AU','*' ,'review',18,'State-level licensing — confirm with counsel')
on conflict (country_code, region_code) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Backfill: every existing user needs a compliance row
-- ---------------------------------------------------------------------------
insert into public.user_compliance (user_id)
select u.id from public.users u
left join public.user_compliance uc on uc.user_id = u.id
where uc.user_id is null;

-- ---------------------------------------------------------------------------
-- 10. Invariants — assert the end state rather than trust the statements above
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['user_compliance','compliance_events','admin_audit_log',
                           'jurisdiction_rules','compliance_settings'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity
    ) then
      raise exception 'RLS not enabled on %', t;
    end if;
  end loop;

  -- The whole design rests on this: no client may write compliance state.
  foreach t in array array['user_compliance','compliance_events','admin_audit_log',
                           'jurisdiction_rules','compliance_settings'] loop
    if has_table_privilege('authenticated', 'public.'||t, 'insert')
       or has_table_privilege('authenticated', 'public.'||t, 'update')
       or has_table_privilege('authenticated', 'public.'||t, 'delete')
       or has_table_privilege('anon', 'public.'||t, 'insert')
       or has_table_privilege('anon', 'public.'||t, 'update')
       or has_table_privilege('anon', 'public.'||t, 'delete') then
      raise exception 'client role holds a write grant on %', t;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.user_compliance', 'select') then
    raise exception 'anon can read user_compliance';
  end if;

  if not exists (select 1 from public.compliance_settings where id) then
    raise exception 'compliance_settings singleton missing';
  end if;
end $$;
