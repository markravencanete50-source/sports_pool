-- Service-only payment fulfilment: all writes commit or roll back together.
create or replace function public.fulfill_stripe_card_purchase(
  p_session_id text, p_payment_id text, p_pool_id uuid, p_user_id uuid,
  p_entry_fee numeric, p_picks jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_pool public.pools%rowtype;
  v_tx public.pool_transactions%rowtype;
  v_card uuid;
  v_slot integer;
  v_game_count integer;
begin
  if p_session_id is null or p_session_id not like 'cs_%' or p_payment_id is null
     or p_user_id is null or p_pool_id is null or p_entry_fee is null
     or p_entry_fee < 20 or p_entry_fee > 99999 or p_entry_fee <> round(p_entry_fee, 2) then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid payment metadata');
  end if;
  -- Serializes both callbacks and independent purchases, including pool capacity.
  select * into v_pool from public.pools where id = p_pool_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Pool unavailable; payment requires refund review');
  end if;
  select * into v_tx from public.pool_transactions where stripe_session_id = p_session_id;
  if found then
    if v_tx.pool_id = p_pool_id and v_tx.user_id = p_user_id and v_tx.amount = p_entry_fee
       and v_tx.status = 'completed' and v_tx.card_id is not null then
      return jsonb_build_object('ok', true, 'cardId', v_tx.card_id, 'alreadyFulfilled', true);
    end if;
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Payment record requires operator review');
  end if;
  if v_pool.status not in ('open', 'active') then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Pool is closed; payment requires refund review');
  end if;

  if p_picks is not null then
    if jsonb_typeof(p_picks) <> 'array' then
      return jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid picks');
    end if;
    select count(*) into v_game_count from public.pool_games where pool_id = p_pool_id;
    if v_game_count = 0 or jsonb_array_length(p_picks) <> v_game_count
       or (select count(distinct p->>'gameId') from jsonb_array_elements(p_picks) p) <> v_game_count
       or exists (
         select 1 from jsonb_array_elements(p_picks) p
         where not exists (select 1 from public.pool_games pg where pg.pool_id = p_pool_id and pg.game_id = p->>'gameId')
            or (p->>'prediction') is null or (p->>'prediction') not in ('home_win', 'away_win', 'tie')
            or (p->>'totalScorePrediction' is not null and
                ((p->>'totalScorePrediction')::numeric not between 1 and 200
                 or (p->>'totalScorePrediction')::numeric <> trunc((p->>'totalScorePrediction')::numeric)))
       ) then
      return jsonb_build_object('ok', false, 'status', 409, 'error', 'Pool schedule or picks changed; payment requires refund review');
    end if;
    perform g.id from public.games g join public.pool_games pg on pg.game_id = g.id
      where pg.pool_id = p_pool_id for share of g;
    if exists (
      select 1 from public.games g join public.pool_games pg on pg.game_id = g.id
      where pg.pool_id = p_pool_id and (g.status <> 'scheduled' or g.date <= clock_timestamp())
    ) then
      return jsonb_build_object('ok', false, 'status', 409, 'error', 'A selected game has started; payment requires refund review');
    end if;
  end if;

  -- Cancelled slots are also occupied under the unconditional unique constraint.
  select slot into v_slot from generate_series(1, 3) slot
    where not exists (select 1 from public.parlay_cards c
      where c.pool_id = p_pool_id and c.user_id = p_user_id and c.card_number = slot)
    order by slot limit 1;
  if v_slot is null then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Card limit reached; payment requires refund review');
  end if;
  if v_pool.max_participants is not null
     and not exists (select 1 from public.pool_transactions where pool_id = p_pool_id and user_id = p_user_id and status = 'completed')
     and (select count(distinct user_id) from public.pool_transactions where pool_id = p_pool_id and status = 'completed') >= v_pool.max_participants then
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Pool is full; payment requires refund review');
  end if;

  insert into public.parlay_cards(pool_id, user_id, card_number, entry_fee_paid, status)
    values(p_pool_id, p_user_id, v_slot, p_entry_fee, case when p_picks is null then 'pending' else 'active' end)
    returning id into v_card;
  if p_picks is not null then
    insert into public.card_picks(card_id, game_id, prediction, total_score_prediction)
      select v_card, p->>'gameId', p->>'prediction', (p->>'totalScorePrediction')::integer
      from jsonb_array_elements(p_picks) p;
  end if;
  -- Existing fee trigger supplies platform_fee and net_amount.
  insert into public.pool_transactions(pool_id, user_id, card_id, amount, status, payment_provider, stripe_session_id, payment_id)
    values(p_pool_id, p_user_id, v_card, p_entry_fee, 'completed', 'stripe', p_session_id, p_payment_id);
  return jsonb_build_object('ok', true, 'cardId', v_card, 'alreadyFulfilled', false);
end;
$$;
revoke all on function public.fulfill_stripe_card_purchase(text, text, uuid, uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.fulfill_stripe_card_purchase(text, text, uuid, uuid, numeric, jsonb) to service_role;

-- Unfiltered SECURITY DEFINER aggregates exposed private-pool finances.
-- Application APIs now establish access before invoking with the service role.
revoke execute on function public.get_pool_financials(uuid) from public, anon, authenticated;
revoke execute on function public.get_pools_financials(uuid[]) from public, anon, authenticated;
grant execute on function public.get_pool_financials(uuid) to service_role;
grant execute on function public.get_pools_financials(uuid[]) to service_role;
