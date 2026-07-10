create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro_monthly', 'pro_yearly')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'cancelled', 'past_due', 'expired')),
  razorpay_customer_id text,
  razorpay_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New rewrite',
  tone text not null default 'Professional',
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tone text,
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  rewrite_count integer not null default 0,
  thread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, usage_date)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'razorpay',
  plan text not null check (plan in ('pro_monthly', 'pro_yearly')),
  status text not null default 'created',
  razorpay_customer_id text,
  razorpay_subscription_id text,
  razorpay_payment_id text,
  razorpay_order_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_threads_updated_at on public.threads;
create trigger set_threads_updated_at
before update on public.threads
for each row execute function public.set_updated_at();

drop trigger if exists set_usage_daily_updated_at on public.usage_daily;
create trigger set_usage_daily_updated_at
before update on public.usage_daily
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create index if not exists idx_threads_user_updated on public.threads(user_id, updated_at desc);
create index if not exists idx_messages_thread_created on public.messages(thread_id, created_at asc);
create index if not exists idx_usage_daily_user_date on public.usage_daily(user_id, usage_date);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_razorpay_sub on public.subscriptions(razorpay_subscription_id);

alter table public.profiles enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.usage_daily enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own_limited" on public.profiles;
-- Profile writes are intentionally handled by trusted server routes.
-- This prevents clients from modifying plan or subscription fields.

drop policy if exists "threads_select_own" on public.threads;
create policy "threads_select_own"
on public.threads for select
using (auth.uid() = user_id);

drop policy if exists "threads_insert_own" on public.threads;
create policy "threads_insert_own"
on public.threads for insert
with check (auth.uid() = user_id);

drop policy if exists "threads_update_own" on public.threads;
create policy "threads_update_own"
on public.threads for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "threads_delete_own" on public.threads;
create policy "threads_delete_own"
on public.threads for delete
using (auth.uid() = user_id);

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
on public.messages for select
using (auth.uid() = user_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
on public.messages for insert
with check (auth.uid() = user_id);

drop policy if exists "usage_daily_select_own" on public.usage_daily;
create policy "usage_daily_select_own"
on public.usage_daily for select
using (auth.uid() = user_id);

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions for select
using (auth.uid() = user_id);

-- No anon/authenticated user policies are defined for webhook_events.
-- Service role bypasses RLS for trusted backend processing.
