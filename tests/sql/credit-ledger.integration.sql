-- Run with an existing non-production test profile:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v user_id='<profile uuid>' \
--   -f tests/sql/credit-ledger.integration.sql
-- The transaction always rolls back.
\if :{?user_id}
\else
  \error 'Pass -v user_id=<existing test profile uuid>'
\endif

begin;
select set_config('prophrase.test_user_id', :'user_id', true);

do $$
declare
  v_user_id uuid := current_setting('prophrase.test_user_id')::uuid;
  v_key text := 'integration:' || txid_current()::text;
  v_baseline integer;
  v_after_grant integer;
  v_reservation uuid;
  v_report record;
begin
  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'TEST_PROFILE_NOT_FOUND';
  end if;

  perform public.ensure_credit_wallet(v_user_id);
  select cached_available_balance into v_baseline
  from public.credit_wallets where user_id = v_user_id;

  perform public.grant_credit_bucket(
    v_user_id, 'promotion', 'integration-test', 10, now(), now() + interval '1 hour',
    'free', v_key
  );
  select cached_available_balance into v_after_grant
  from public.credit_wallets where user_id = v_user_id;
  if v_after_grant <> v_baseline + 10 then raise exception 'GRANT_FAILED'; end if;

  perform public.grant_credit_bucket(
    v_user_id, 'promotion', 'integration-test', 10, now(), now() + interval '1 hour',
    'free', v_key
  );
  if (select cached_available_balance from public.credit_wallets where user_id = v_user_id) <> v_after_grant then
    raise exception 'DUPLICATE_GRANT';
  end if;

  select reservation_id into v_reservation from public.reserve_credits(
    v_user_id, gen_random_uuid(), v_key || ':commit', 'hash-commit', 'rephrase',
    2, 800, '501-1200', 'core_rephrase', 'standard', now() + interval '5 minutes'
  );
  perform public.commit_credit_reservation(v_user_id, v_reservation);
  perform public.commit_credit_reservation(v_user_id, v_reservation);
  if (select count(*) from public.credit_usage where reservation_id = v_reservation) <> 1 then
    raise exception 'DUPLICATE_COMMIT';
  end if;

  select reservation_id into v_reservation from public.reserve_credits(
    v_user_id, gen_random_uuid(), v_key || ':release', 'hash-release', 'rephrase',
    4, 1500, '1201-2500', 'core_rephrase', 'standard', now() + interval '5 minutes'
  );
  perform public.release_credit_reservation(v_user_id, v_reservation, 'provider_failure');
  perform public.release_credit_reservation(v_user_id, v_reservation, 'provider_failure_retry');

  perform public.admin_adjust_credits(
    v_user_id, 3, 'integration_test', 'Automated integration test adjustment',
    v_user_id, 'integration-test'
  );
  if not exists (
    select 1 from public.credit_adjustments
    where user_id = v_user_id and reason_code = 'integration_test'
  ) then raise exception 'ADMIN_AUDIT_MISSING'; end if;

  select * into v_report from public.reconcile_credit_wallet(v_user_id, false);
  if v_report.mismatch then raise exception 'RECONCILIATION_MISMATCH'; end if;
  if v_report.cached_available < 0 or v_report.cached_reserved < 0 then
    raise exception 'NEGATIVE_BALANCE';
  end if;
end $$;

rollback;
