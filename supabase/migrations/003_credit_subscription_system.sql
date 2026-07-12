-- Additive credit-ledger and subscription migration. Apply after backing up
-- profiles, subscriptions, usage_daily, and webhook_events.
create extension if not exists pgcrypto;

alter table public.profiles drop constraint if exists profiles_plan_check;
update public.profiles
set plan = case
  when plan in ('pro_monthly', 'pro_yearly') then 'plus'
  when plan in ('free', 'plus', 'pro') then plan
  else 'free'
end;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'plus', 'pro'));
alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check
  check (subscription_status in ('inactive', 'free', 'pending', 'active', 'past_due', 'grace_period', 'cancelled', 'canceled', 'expired', 'refunded', 'chargeback'));
alter table public.profiles
  add column if not exists billing_interval text not null default 'none',
  add column if not exists grace_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles drop constraint if exists profiles_billing_interval_check;
alter table public.profiles
  add constraint profiles_billing_interval_check
  check (billing_interval in ('none', 'monthly', 'annual'));
update public.profiles
set billing_interval = case
  when razorpay_subscription_id is null then 'none'
  when exists (
    select 1 from public.subscriptions legacy
    where legacy.user_id = profiles.id and legacy.plan = 'pro_yearly'
  ) then 'annual'
  when current_period_end is not null and plan = 'plus' then 'monthly'
  else billing_interval
end;

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions alter column plan drop not null;
alter table public.subscriptions
  add column if not exists plan_id text,
  add column if not exists billing_interval text,
  add column if not exists internal_status text,
  add column if not exists provider_price_id text,
  add column if not exists entitlement_cycle_start timestamptz,
  add column if not exists entitlement_cycle_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists grace_period_end timestamptz,
  add column if not exists provider_event_created_at timestamptz,
  add column if not exists checkout_idempotency_key text,
  add column if not exists checkout_request_hash text,
  add column if not exists pending_plan_id text,
  add column if not exists pending_billing_interval text,
  add column if not exists plan_change_effective_at timestamptz,
  add column if not exists migration_source text;
update public.subscriptions
set
  plan_id = coalesce(plan_id, case when plan in ('pro_monthly', 'pro_yearly') then 'plus' else 'free' end),
  billing_interval = coalesce(billing_interval, case when plan = 'pro_yearly' then 'annual' else 'monthly' end),
  internal_status = coalesce(internal_status, case
    when status = 'active' then 'active'
    when status in ('cancelled', 'canceled') then 'canceled'
    when status = 'past_due' then 'past_due'
    when status = 'expired' then 'expired'
    else 'pending'
  end),
  migration_source = coalesce(migration_source, 'legacy_pro_to_plus');
alter table public.subscriptions alter column plan_id set default 'free';
alter table public.subscriptions alter column billing_interval set default 'none';
alter table public.subscriptions alter column internal_status set default 'pending';
alter table public.subscriptions drop constraint if exists subscriptions_plan_id_check;
alter table public.subscriptions add constraint subscriptions_plan_id_check
  check (plan_id in ('free', 'plus', 'pro'));
alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_check
  check (billing_interval in ('none', 'monthly', 'annual'));
alter table public.subscriptions drop constraint if exists subscriptions_internal_status_check;
alter table public.subscriptions add constraint subscriptions_internal_status_check
  check (internal_status in ('free', 'pending', 'active', 'past_due', 'grace_period', 'canceled', 'expired', 'refunded', 'chargeback'));

create unique index if not exists idx_subscriptions_provider_subscription_unique
on public.subscriptions(provider, razorpay_subscription_id)
where razorpay_subscription_id is not null;
create unique index if not exists idx_subscriptions_checkout_idempotency
on public.subscriptions(user_id, checkout_idempotency_key)
where checkout_idempotency_key is not null;
create index if not exists idx_subscriptions_user_status
on public.subscriptions(user_id, internal_status, updated_at desc);
create index if not exists idx_subscriptions_entitlement_end
on public.subscriptions(internal_status, entitlement_cycle_end)
where internal_status in ('active', 'grace_period');

create table if not exists public.credit_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  cached_available_balance integer not null default 0 check (cached_available_balance >= 0),
  cached_reserved_balance integer not null default 0 check (cached_reserved_balance >= 0),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_buckets (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.credit_wallets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('free_daily_grant', 'plus_monthly_grant', 'pro_monthly_grant', 'upgrade_adjustment', 'admin_adjustment', 'promotion', 'refund_reversal', 'migration')),
  source_reference_id text,
  original_amount integer not null check (original_amount > 0),
  remaining_amount integer not null check (remaining_amount >= 0 and remaining_amount <= original_amount),
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  plan_id text not null check (plan_id in ('free', 'plus', 'pro')),
  grant_period_key text not null,
  created_at timestamptz not null default now(),
  unique(wallet_id, source_type, grant_period_key)
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.credit_wallets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  operation_type text not null check (operation_type in ('rephrase', 'outcome_assistant', 'regenerate_all', 'extra_variant', 'tone_explanation', 'edited_message_check', 'voice_transcription')),
  credit_cost integer not null check (credit_cost >= 0),
  billable_characters integer not null check (billable_characters >= 0),
  input_length_bucket text not null,
  feature text not null,
  model_tier text not null default 'standard',
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  unique(user_id, idempotency_key)
);

create table if not exists public.credit_usage (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.credit_wallets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  reservation_id uuid not null unique references public.credit_reservations(id),
  operation_type text not null,
  credit_cost integer not null check (credit_cost >= 0),
  billable_characters integer not null check (billable_characters >= 0),
  input_length_bucket text not null,
  feature text not null,
  model_tier text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.credit_reservations(id) on delete cascade,
  credit_bucket_id uuid not null references public.credit_buckets(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(reservation_id, credit_bucket_id)
);

create table if not exists public.credit_usage_allocations (
  id uuid primary key default gen_random_uuid(),
  credit_usage_id uuid not null references public.credit_usage(id) on delete cascade,
  credit_bucket_id uuid not null references public.credit_buckets(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(credit_usage_id, credit_bucket_id)
);

create table if not exists public.credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.credit_wallets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason_code text not null,
  reason_text text not null,
  created_by uuid,
  support_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_shadow_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  operation_type text not null,
  credit_cost integer not null,
  billable_characters integer not null,
  input_length_bucket text not null,
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);

create table if not exists public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  event_type text not null,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  operation_type text not null,
  request_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

alter table public.webhook_events
  add column if not exists processing_status text not null default 'received',
  add column if not exists payload_hash text,
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists failure_reason text,
  add column if not exists attempt_count integer not null default 1;
alter table public.webhook_events alter column payload drop not null;
create index if not exists idx_webhook_events_processing
on public.webhook_events(processing_status, received_at);

create index if not exists idx_credit_buckets_active_expiry
on public.credit_buckets(wallet_id, expires_at, created_at)
where remaining_amount > 0;
create index if not exists idx_credit_reservations_status_expiry
on public.credit_reservations(status, expires_at);
create index if not exists idx_credit_usage_user_created
on public.credit_usage(user_id, created_at desc);
create index if not exists idx_credit_shadow_user_created
on public.credit_shadow_estimates(user_id, created_at desc);
create index if not exists idx_billing_audit_user_created
on public.billing_audit_events(user_id, created_at desc);

drop trigger if exists set_credit_wallets_updated_at on public.credit_wallets;
create trigger set_credit_wallets_updated_at before update on public.credit_wallets
for each row execute function public.set_updated_at();

alter table public.credit_wallets enable row level security;
alter table public.credit_buckets enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_usage enable row level security;
alter table public.credit_reservation_allocations enable row level security;
alter table public.credit_usage_allocations enable row level security;
alter table public.credit_adjustments enable row level security;
alter table public.credit_shadow_estimates enable row level security;
alter table public.billing_audit_events enable row level security;
alter table public.billing_idempotency_keys enable row level security;
drop trigger if exists set_billing_idempotency_updated_at on public.billing_idempotency_keys;
create trigger set_billing_idempotency_updated_at before update on public.billing_idempotency_keys
for each row execute function public.set_updated_at();

create or replace function public.ensure_credit_wallet(p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_wallet_id uuid;
begin
  insert into public.credit_wallets(user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select id into v_wallet_id from public.credit_wallets where user_id = p_user_id;
  return v_wallet_id;
end;
$$;

create or replace function public.grant_credit_bucket(
  p_user_id uuid,
  p_source_type text,
  p_source_reference_id text,
  p_amount integer,
  p_valid_from timestamptz,
  p_expires_at timestamptz,
  p_plan_id text,
  p_grant_period_key text
)
returns table(bucket_id uuid, created boolean, available_balance integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_bucket_id uuid;
  v_inserted integer;
  v_expired integer;
begin
  if p_amount <= 0 or p_expires_at <= p_valid_from then
    raise exception 'INVALID_CREDIT_GRANT';
  end if;
  v_wallet_id := public.ensure_credit_wallet(p_user_id);
  perform 1 from public.credit_wallets where id = v_wallet_id for update;

  select coalesce(sum(remaining_amount), 0)::integer into v_expired
  from public.credit_buckets
  where wallet_id = v_wallet_id and remaining_amount > 0 and expires_at <= now();
  update public.credit_buckets set remaining_amount = 0
  where wallet_id = v_wallet_id and remaining_amount > 0 and expires_at <= now();
  if v_expired > 0 then
    update public.credit_wallets
    set cached_available_balance = greatest(0, cached_available_balance - v_expired), version = version + 1
    where id = v_wallet_id;
  end if;

  insert into public.credit_buckets(
    wallet_id, user_id, source_type, source_reference_id, original_amount,
    remaining_amount, valid_from, expires_at, plan_id, grant_period_key
  ) values (
    v_wallet_id, p_user_id, p_source_type, p_source_reference_id, p_amount,
    p_amount, p_valid_from, p_expires_at, p_plan_id, p_grant_period_key
  ) on conflict (wallet_id, source_type, grant_period_key) do nothing
  returning id into v_bucket_id;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.credit_wallets
    set cached_available_balance = cached_available_balance + p_amount, version = version + 1
    where id = v_wallet_id;
  else
    select id into v_bucket_id from public.credit_buckets
    where wallet_id = v_wallet_id and source_type = p_source_type
      and grant_period_key = p_grant_period_key;
  end if;

  return query select v_bucket_id, v_inserted = 1,
    (select cached_available_balance from public.credit_wallets where id = v_wallet_id);
end;
$$;

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_request_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_operation_type text,
  p_credit_cost integer,
  p_billable_characters integer,
  p_input_length_bucket text,
  p_feature text,
  p_model_tier text,
  p_expires_at timestamptz
)
returns table(reservation_id uuid, reservation_status text, available_balance integer, reserved_balance integer, duplicate boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_existing public.credit_reservations%rowtype;
  v_bucket public.credit_buckets%rowtype;
  v_released integer;
  v_expired_reserved integer;
  v_reservation_id uuid;
  v_remaining integer;
  v_take integer;
begin
  if p_credit_cost < 0 or p_expires_at <= now() then raise exception 'INVALID_RESERVATION'; end if;
  perform public.ensure_credit_wallet(p_user_id);
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;

  select coalesce(sum(credit_cost), 0)::integer into v_expired_reserved
  from public.credit_reservations
  where wallet_id = v_wallet.id and status = 'reserved' and expires_at <= now();
  with allocation_totals as (
    select allocation.credit_bucket_id, sum(allocation.amount)::integer as amount
    from public.credit_reservation_allocations allocation
    join public.credit_reservations reservation on reservation.id = allocation.reservation_id
    where reservation.wallet_id = v_wallet.id and reservation.status = 'reserved'
      and reservation.expires_at <= now()
    group by allocation.credit_bucket_id
  ), restored as (
    update public.credit_buckets bucket
    set remaining_amount = remaining_amount + allocation_totals.amount
    from allocation_totals
    where bucket.id = allocation_totals.credit_bucket_id and bucket.expires_at > now()
    returning allocation_totals.amount
  ) select coalesce(sum(amount), 0)::integer into v_released from restored;
  update public.credit_reservations
  set status = 'expired', released_at = now(), release_reason = 'reservation_timeout'
  where wallet_id = v_wallet.id and status = 'reserved' and expires_at <= now();
  if v_expired_reserved > 0 then
    update public.credit_wallets set
      cached_available_balance = cached_available_balance + v_released,
      cached_reserved_balance = greatest(0, cached_reserved_balance - v_expired_reserved),
      version = version + 1
    where id = v_wallet.id
    returning * into v_wallet;
  end if;

  select * into v_existing from public.credit_reservations
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> p_request_hash or v_existing.operation_type <> p_operation_type then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return query select v_existing.id, v_existing.status,
      v_wallet.cached_available_balance, v_wallet.cached_reserved_balance, true;
    return;
  end if;

  if v_wallet.cached_available_balance < p_credit_cost then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;
  insert into public.credit_reservations(
    wallet_id, user_id, request_id, idempotency_key, request_hash,
    operation_type, credit_cost, billable_characters, input_length_bucket,
    feature, model_tier, expires_at
  ) values (
    v_wallet.id, p_user_id, p_request_id, p_idempotency_key, p_request_hash,
    p_operation_type, p_credit_cost, p_billable_characters,
    p_input_length_bucket, p_feature, p_model_tier, p_expires_at
  ) returning id into v_reservation_id;
  v_remaining := p_credit_cost;
  for v_bucket in
    select * from public.credit_buckets
    where wallet_id = v_wallet.id and remaining_amount > 0 and expires_at > now()
    order by expires_at asc, created_at asc for update
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, v_bucket.remaining_amount);
    update public.credit_buckets set remaining_amount = remaining_amount - v_take
    where id = v_bucket.id;
    insert into public.credit_reservation_allocations(reservation_id, credit_bucket_id, amount)
    values (v_reservation_id, v_bucket.id, v_take);
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining <> 0 then raise exception 'CREDIT_ALLOCATION_MISMATCH'; end if;
  update public.credit_wallets set
    cached_available_balance = cached_available_balance - p_credit_cost,
    cached_reserved_balance = cached_reserved_balance + p_credit_cost,
    version = version + 1
  where id = v_wallet.id returning * into v_wallet;
  return query select v_reservation_id, 'reserved'::text,
    v_wallet.cached_available_balance, v_wallet.cached_reserved_balance, false;
end;
$$;

create or replace function public.commit_credit_reservation(p_user_id uuid, p_reservation_id uuid)
returns table(usage_id uuid, charged integer, available_balance integer, reserved_balance integer, duplicate boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_reservation public.credit_reservations%rowtype;
  v_usage_id uuid;
begin
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;
  select * into v_reservation from public.credit_reservations
  where id = p_reservation_id and user_id = p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if v_reservation.status = 'committed' then
    select id into v_usage_id from public.credit_usage where reservation_id = p_reservation_id;
    return query select v_usage_id, v_reservation.credit_cost,
      v_wallet.cached_available_balance, v_wallet.cached_reserved_balance, true;
    return;
  end if;
  if v_reservation.status <> 'reserved' then raise exception 'RESERVATION_NOT_ACTIVE'; end if;

  insert into public.credit_usage(
    wallet_id, user_id, request_id, reservation_id, operation_type, credit_cost,
    billable_characters, input_length_bucket, feature, model_tier
  ) values (
    v_wallet.id, p_user_id, v_reservation.request_id, v_reservation.id,
    v_reservation.operation_type, v_reservation.credit_cost,
    v_reservation.billable_characters, v_reservation.input_length_bucket,
    v_reservation.feature, v_reservation.model_tier
  ) returning id into v_usage_id;

  insert into public.credit_usage_allocations(credit_usage_id, credit_bucket_id, amount)
  select v_usage_id, credit_bucket_id, amount
  from public.credit_reservation_allocations
  where reservation_id = v_reservation.id;

  update public.credit_reservations set status = 'committed', committed_at = now()
  where id = v_reservation.id;
  update public.credit_wallets set
    cached_reserved_balance = greatest(0, cached_reserved_balance - v_reservation.credit_cost),
    version = version + 1
  where id = v_wallet.id returning * into v_wallet;
  return query select v_usage_id, v_reservation.credit_cost,
    v_wallet.cached_available_balance, v_wallet.cached_reserved_balance, false;
end;
$$;

create or replace function public.release_credit_reservation(
  p_user_id uuid, p_reservation_id uuid, p_reason text
)
returns table(released integer, available_balance integer, reserved_balance integer, duplicate boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_reservation public.credit_reservations%rowtype;
  v_restored integer;
begin
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;
  select * into v_reservation from public.credit_reservations
  where id = p_reservation_id and user_id = p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if v_reservation.status <> 'reserved' then
    return query select 0, v_wallet.cached_available_balance,
      v_wallet.cached_reserved_balance, true;
    return;
  end if;
  update public.credit_reservations set
    status = 'released', released_at = now(), release_reason = left(p_reason, 120)
  where id = v_reservation.id;
  with restored as (
    update public.credit_buckets bucket
    set remaining_amount = remaining_amount + allocation.amount
    from public.credit_reservation_allocations allocation
    where allocation.reservation_id = v_reservation.id
      and allocation.credit_bucket_id = bucket.id
      and bucket.expires_at > now()
    returning allocation.amount
  ) select coalesce(sum(amount), 0)::integer into v_restored from restored;
  update public.credit_wallets set
    cached_available_balance = cached_available_balance + v_restored,
    cached_reserved_balance = greatest(0, cached_reserved_balance - v_reservation.credit_cost),
    version = version + 1
  where id = v_wallet.id returning * into v_wallet;
  return query select v_restored, v_wallet.cached_available_balance,
    v_wallet.cached_reserved_balance, false;
end;
$$;

create or replace function public.reconcile_credit_wallet(p_user_id uuid, p_apply boolean default false)
returns table(cached_available integer, calculated_available integer, cached_reserved integer, calculated_reserved integer, mismatch boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_available integer;
  v_reserved integer;
begin
  perform public.ensure_credit_wallet(p_user_id);
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;
  select coalesce(sum(remaining_amount), 0)::integer into v_available
  from public.credit_buckets where wallet_id = v_wallet.id and expires_at > now();
  select coalesce(sum(credit_cost), 0)::integer into v_reserved
  from public.credit_reservations where wallet_id = v_wallet.id
    and status = 'reserved' and expires_at > now();
  if p_apply and (v_available <> v_wallet.cached_available_balance or v_reserved <> v_wallet.cached_reserved_balance) then
    update public.credit_wallets set cached_available_balance = v_available,
      cached_reserved_balance = v_reserved, version = version + 1
    where id = v_wallet.id;
  end if;
  return query select v_wallet.cached_available_balance, v_available,
    v_wallet.cached_reserved_balance, v_reserved,
    v_available <> v_wallet.cached_available_balance or v_reserved <> v_wallet.cached_reserved_balance;
end;
$$;

create or replace function public.expire_credit_buckets(
  p_user_id uuid, p_plan_id text default null, p_reason text default 'plan_change'
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_expired integer;
begin
  perform public.ensure_credit_wallet(p_user_id);
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;
  select coalesce(sum(remaining_amount), 0)::integer into v_expired
  from public.credit_buckets
  where wallet_id = v_wallet.id and remaining_amount > 0
    and (p_plan_id is null or plan_id = p_plan_id);
  update public.credit_buckets set remaining_amount = 0
  where wallet_id = v_wallet.id and remaining_amount > 0
    and (p_plan_id is null or plan_id = p_plan_id);
  update public.credit_wallets set
    cached_available_balance = greatest(0, cached_available_balance - v_expired),
    version = version + 1
  where id = v_wallet.id;
  insert into public.billing_audit_events(user_id, event_type, metadata)
  values (p_user_id, 'credit_buckets_expired', jsonb_build_object('amount', v_expired, 'reason', left(p_reason, 80)));
  return v_expired;
end;
$$;

create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason_code text,
  p_reason_text text,
  p_created_by uuid,
  p_support_reference text default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_bucket public.credit_buckets%rowtype;
  v_remaining integer;
  v_take integer;
begin
  if p_amount = 0 or length(trim(p_reason_text)) < 3 then raise exception 'INVALID_ADJUSTMENT'; end if;
  if p_amount > 0 then
    perform public.grant_credit_bucket(
      p_user_id, 'admin_adjustment', p_support_reference, p_amount, now(),
      now() + interval '1 year', 'free', 'admin:' || gen_random_uuid()::text
    );
  else
    perform public.ensure_credit_wallet(p_user_id);
    select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;
    if v_wallet.cached_available_balance < abs(p_amount) then raise exception 'INSUFFICIENT_UNUSED_CREDITS'; end if;
    v_remaining := abs(p_amount);
    for v_bucket in select * from public.credit_buckets
      where wallet_id = v_wallet.id and remaining_amount > 0 and expires_at > now()
      order by expires_at asc, created_at asc for update
    loop
      exit when v_remaining = 0;
      v_take := least(v_remaining, v_bucket.remaining_amount);
      update public.credit_buckets set remaining_amount = remaining_amount - v_take where id = v_bucket.id;
      v_remaining := v_remaining - v_take;
    end loop;
    update public.credit_wallets set cached_available_balance = cached_available_balance - abs(p_amount), version = version + 1
    where id = v_wallet.id;
  end if;
  insert into public.credit_adjustments(wallet_id, user_id, amount, reason_code, reason_text, created_by, support_reference)
  select id, p_user_id, p_amount, left(p_reason_code, 80), left(p_reason_text, 500), p_created_by, left(p_support_reference, 120)
  from public.credit_wallets where user_id = p_user_id;
  return (select cached_available_balance from public.credit_wallets where user_id = p_user_id);
end;
$$;

revoke all on function public.ensure_credit_wallet(uuid) from public, anon, authenticated;
revoke all on function public.grant_credit_bucket(uuid, text, text, integer, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, uuid, text, text, text, integer, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.commit_credit_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_credit_reservation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reconcile_credit_wallet(uuid, boolean) from public, anon, authenticated;
revoke all on function public.expire_credit_buckets(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_adjust_credits(uuid, integer, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_credit_wallet(uuid) to service_role;
grant execute on function public.grant_credit_bucket(uuid, text, text, integer, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.reserve_credits(uuid, uuid, text, text, text, integer, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.commit_credit_reservation(uuid, uuid) to service_role;
grant execute on function public.release_credit_reservation(uuid, uuid, text) to service_role;
grant execute on function public.reconcile_credit_wallet(uuid, boolean) to service_role;
grant execute on function public.expire_credit_buckets(uuid, text, text) to service_role;
grant execute on function public.admin_adjust_credits(uuid, integer, text, text, uuid, text) to service_role;
