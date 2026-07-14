create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['rephrase', 'outcome_assistant', 'credits']::text[],
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_tokens_user_id_idx
  on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;

drop policy if exists "Users can read their API tokens" on public.api_tokens;
create policy "Users can read their API tokens"
  on public.api_tokens for select
  using (auth.uid() = user_id);

revoke all on public.api_tokens from anon;
grant select on public.api_tokens to authenticated;
