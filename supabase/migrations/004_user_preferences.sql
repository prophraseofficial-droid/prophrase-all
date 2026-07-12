create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences_version integer not null default 1 check (preferences_version = 1),
  preferences jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  existing_notice_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own"
on public.user_preferences for select
using (auth.uid() = user_id);

-- Writes are handled by authenticated server routes using the service role.
