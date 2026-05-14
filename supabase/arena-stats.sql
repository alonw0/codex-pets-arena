alter table public.profiles
add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx on public.profiles (last_seen_at desc);
create index if not exists pets_valid_active_idx on public.pets (validation_status, active);
create index if not exists battles_status_idx on public.battles (status);
create index if not exists match_queue_status_idx on public.match_queue (status);
