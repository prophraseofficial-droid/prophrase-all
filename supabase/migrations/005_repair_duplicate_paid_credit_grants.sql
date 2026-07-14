create temporary table duplicate_paid_credit_groups on commit drop as
select
  wallet_id,
  source_type,
  plan_id,
  coalesce(source_reference_id, '') as source_reference_key,
  date_trunc('month', valid_from at time zone 'UTC') as grant_month
from public.credit_buckets
where source_type in ('plus_monthly_grant', 'pro_monthly_grant')
group by wallet_id, source_type, plan_id, coalesce(source_reference_id, ''),
  date_trunc('month', valid_from at time zone 'UTC')
having count(*) > 1;

with ranked as (
  select
    bucket.id,
    row_number() over (
      partition by bucket.wallet_id, bucket.source_type, bucket.plan_id,
        coalesce(bucket.source_reference_id, ''),
        date_trunc('month', bucket.valid_from at time zone 'UTC')
      order by bucket.created_at, bucket.id
    ) as bucket_rank,
    greatest(
      max(bucket.original_amount) over (
        partition by bucket.wallet_id, bucket.source_type, bucket.plan_id,
          coalesce(bucket.source_reference_id, ''),
          date_trunc('month', bucket.valid_from at time zone 'UTC')
      ) - sum(bucket.original_amount - bucket.remaining_amount) over (
        partition by bucket.wallet_id, bucket.source_type, bucket.plan_id,
          coalesce(bucket.source_reference_id, ''),
          date_trunc('month', bucket.valid_from at time zone 'UTC')
      ),
      0
    )::integer as repaired_remaining
  from public.credit_buckets bucket
  join duplicate_paid_credit_groups duplicate_group
    on duplicate_group.wallet_id = bucket.wallet_id
    and duplicate_group.source_type = bucket.source_type
    and duplicate_group.plan_id = bucket.plan_id
    and duplicate_group.source_reference_key = coalesce(bucket.source_reference_id, '')
    and duplicate_group.grant_month = date_trunc('month', bucket.valid_from at time zone 'UTC')
)
update public.credit_buckets bucket
set remaining_amount = case
  when ranked.bucket_rank = 1 then ranked.repaired_remaining
  else 0
end
from ranked
where bucket.id = ranked.id;

update public.credit_wallets wallet
set
  cached_available_balance = coalesce((
    select sum(bucket.remaining_amount)::integer
    from public.credit_buckets bucket
    where bucket.wallet_id = wallet.id
      and bucket.expires_at > now()
  ), 0),
  version = version + 1,
  updated_at = now()
where wallet.id in (select wallet_id from duplicate_paid_credit_groups);

insert into public.billing_audit_events(user_id, event_type, metadata)
select
  wallet.user_id,
  'duplicate_paid_credit_grants_repaired',
  jsonb_build_object('source', 'migration_005')
from public.credit_wallets wallet
where wallet.id in (select wallet_id from duplicate_paid_credit_groups);
