begin;
set local role service_role;
do $qa$
declare
  v_pool uuid := gen_random_uuid();
  v_user uuid;
  v_other uuid;
  v_home text;
  v_away text;
  v_game text := 'qa_' || gen_random_uuid()::text;
  v_session text := 'cs_test_qa_' || gen_random_uuid()::text;
  v_picks jsonb;
  v_first jsonb;
  v_again jsonb;
  v_result jsonb;
begin
  select id into strict v_user from public.users limit 1;
  select id into v_other from public.users where id <> v_user limit 1;
  select id into strict v_home from public.teams limit 1;
  select id into strict v_away from public.teams where id <> v_home limit 1;
  insert into public.pools(id,name,type,week,season,created_by,entry_fee,max_participants)
    values(v_pool,'QA rollback only','private',2,2026,v_user,20,1);
  insert into public.games(id,home_team_id,away_team_id,date,status,season,week)
    values(v_game,v_home,v_away,now()+interval '7 days','scheduled',2026,2);
  insert into public.pool_games(pool_id,game_id) values(v_pool,v_game);
  v_picks := jsonb_build_array(jsonb_build_object('gameId',v_game,'prediction','home_win','totalScorePrediction',42));
  v_first := public.fulfill_stripe_card_purchase(v_session,'pi_'||v_session,v_pool,v_user,20,v_picks);
  if (v_first->>'ok')::boolean is distinct from true then raise exception 'valid fulfilment failed: %', v_first; end if;
  v_again := public.fulfill_stripe_card_purchase(v_session,'pi_'||v_session,v_pool,v_user,20,v_picks);
  if v_first->>'cardId' <> v_again->>'cardId' or (v_again->>'alreadyFulfilled')::boolean is distinct from true then
    raise exception 'duplicate callback created different card'; end if;
  if (select count(*) from public.parlay_cards where pool_id=v_pool) <> 1
     or (select count(*) from public.pool_transactions where pool_id=v_pool) <> 1
     or (select count(*) from public.card_picks where card_id=(v_first->>'cardId')::uuid) <> 1 then
    raise exception 'duplicate or incomplete write'; end if;

  -- Force ledger failure after card and picks have been inserted.
  begin
    perform public.fulfill_stripe_card_purchase(v_session||'_conflict','pi_'||v_session,v_pool,v_user,20,v_picks);
    raise exception 'expected unique payment failure';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.parlay_cards where pool_id=v_pool) <> 1 then raise exception 'orphan card survived ledger failure'; end if;
  if v_other is not null then
    v_result := public.fulfill_stripe_card_purchase(v_session||'_full','pi_full_'||v_session,v_pool,v_other,20,v_picks);
    if (v_result->>'status')::integer is distinct from 409 then raise exception 'pool capacity bypass'; end if;
  end if;

  update public.games set date=now()-interval '1 hour' where id=v_game;
  v_result := public.fulfill_stripe_card_purchase(v_session||'_late','pi_late_'||v_session,v_pool,v_user,20,v_picks);
  if (v_result->>'status')::integer is distinct from 409 then raise exception 'late picks accepted'; end if;
  v_again := public.fulfill_stripe_card_purchase(v_session,'pi_'||v_session,v_pool,v_user,20,v_picks);
  if (v_again->>'alreadyFulfilled')::boolean is distinct from true then raise exception 'late webhook lost existing card'; end if;

  if has_function_privilege('anon','public.fulfill_stripe_card_purchase(text,text,uuid,uuid,numeric,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.fulfill_stripe_card_purchase(text,text,uuid,uuid,numeric,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.get_pool_financials(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.get_pools_financials(uuid[])','EXECUTE') then
    raise exception 'client can reach server-only money RPC'; end if;
end;
$qa$;
rollback;
select 'PASS: atomic writes, duplicate replay, rollback on ledger conflict, capacity, late picks, and RPC privileges; all fixtures rolled back' as result;
