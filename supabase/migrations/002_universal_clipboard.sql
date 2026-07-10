create table if not exists public.devices (
  id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  platform text not null default 'web',
  capabilities text[] not null default '{}',
  last_seen_at timestamptz not null default now(),
  trusted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.universal_clipboard_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_device_id text not null,
  source_device_label text not null,
  payload text not null,
  preview text not null,
  status text not null default 'available' check (status in ('available', 'claimed', 'expired')),
  claimed_by_device_id text,
  claimed_by_device_label text,
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint universal_clipboard_claim_consistency check (
    (status = 'claimed' and claimed_by_device_id is not null and claimed_at is not null)
    or (status <> 'claimed')
  )
);

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists set_universal_clipboard_items_updated_at on public.universal_clipboard_items;
create trigger set_universal_clipboard_items_updated_at
before update on public.universal_clipboard_items
for each row execute function public.set_updated_at();

create index if not exists idx_devices_user_seen
on public.devices(user_id, last_seen_at desc);

create index if not exists idx_universal_clipboard_user_created
on public.universal_clipboard_items(user_id, created_at desc);

create index if not exists idx_universal_clipboard_user_status_expires
on public.universal_clipboard_items(user_id, status, expires_at desc);

alter table public.devices enable row level security;
alter table public.universal_clipboard_items enable row level security;

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own"
on public.devices for select
using (auth.uid() = user_id);

-- Writes are intentionally handled by trusted server routes so claim behavior
-- remains atomic and payload release can be controlled by application logic.
-- No direct authenticated-user policy is defined for universal_clipboard_items:
-- clients read metadata and receive payloads only through trusted API routes.
