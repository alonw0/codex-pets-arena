create type public.validation_status as enum ('pending', 'valid', 'rejected');
create type public.battle_status as enum ('waiting', 'active', 'complete', 'abandoned');
create type public.lobby_status as enum ('open', 'active', 'expired', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Trainer' check (char_length(display_name) between 1 and 40),
  avatar_url text,
  rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Trainer'), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.increment_profile_result(target_profile_id uuid, result_column text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  if result_column = 'wins' then
    update public.profiles
    set wins = wins + 1
    where id = target_profile_id
    returning wins into next_value;
  elsif result_column = 'losses' then
    update public.profiles
    set losses = losses + 1
    where id = target_profile_id
    returning losses into next_value;
  else
    raise exception 'Unsupported profile result column: %', result_column;
  end if;

  if next_value is null then
    raise exception 'Profile % not found', target_profile_id;
  end if;

  return next_value;
end;
$$;

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  description text not null default '' check (char_length(description) <= 512),
  manifest_path text not null,
  spritesheet_path text not null,
  thumbnail_path text,
  affinity text not null,
  level integer not null default 1,
  xp integer not null default 0,
  stats jsonb not null,
  validation_status public.validation_status not null default 'pending',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.moves (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  slot integer not null check (slot between 1 and 4),
  display_name text not null,
  move_key text not null,
  power integer not null,
  accuracy integer not null check (accuracy between 1 and 100),
  category text not null,
  affinity text not null,
  max_charges integer not null,
  effect jsonb,
  unique (pet_id, slot)
);

create table public.match_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  status text not null default 'waiting',
  created_at timestamptz not null default now()
);

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid references public.profiles(id) on delete set null,
  host_pet_id uuid references public.pets(id) on delete set null,
  guest_pet_id uuid references public.pets(id) on delete set null,
  status public.lobby_status not null default 'open',
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);

create table public.battles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete cascade,
  player_pet_id uuid not null references public.pets(id) on delete restrict,
  opponent_pet_id uuid references public.pets(id) on delete restrict,
  mode text not null default 'pvp' check (mode in ('pvp', 'npc')),
  npc_master_key text,
  current_turn integer not null default 1,
  state jsonb not null,
  status public.battle_status not null default 'active',
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.battle_turns (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  turn_number integer not null,
  player_action jsonb,
  opponent_action jsonb,
  resolved_log jsonb,
  rng_seed integer not null,
  timeout_flags jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (battle_id, turn_number)
);

create table public.battle_events (
  id bigint generated always as identity primary key,
  battle_id uuid not null references public.battles(id) on delete cascade,
  turn_number integer not null,
  event jsonb not null,
  created_at timestamptz not null default now()
);

create table public.profile_badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  metadata jsonb not null default '{}',
  earned_at timestamptz not null default now(),
  unique (profile_id, badge_key)
);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.moves enable row level security;
alter table public.match_queue enable row level security;
alter table public.lobbies enable row level security;
alter table public.battles enable row level security;
alter table public.battle_turns enable row level security;
alter table public.battle_events enable row level security;
alter table public.profile_badges enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = id);
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
grant select on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
create policy "profiles self update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and char_length(display_name) between 1 and 40
    and (avatar_url is null or char_length(avatar_url) <= 512)
  );

revoke all on function public.increment_profile_result(uuid, text) from public;
revoke all on function public.increment_profile_result(uuid, text) from anon;
revoke all on function public.increment_profile_result(uuid, text) from authenticated;
grant execute on function public.increment_profile_result(uuid, text) to service_role;

create policy "pets readable" on public.pets for select using (validation_status = 'valid' or auth.uid() = owner_id);

create policy "moves readable" on public.moves for select using (
  exists (select 1 from public.pets where pets.id = moves.pet_id and (pets.validation_status = 'valid' or pets.owner_id = auth.uid()))
);

create policy "queue self read" on public.match_queue for select using (auth.uid() = user_id);

create policy "lobbies participants read" on public.lobbies for select using (auth.uid() in (host_id, guest_id));

create policy "battles participants read" on public.battles for select using (auth.uid() = player_id or auth.uid() = opponent_id);

create policy "turns participants read" on public.battle_turns for select using (
  exists (select 1 from public.battles where battles.id = battle_turns.battle_id and auth.uid() in (battles.player_id, battles.opponent_id))
);

create policy "events participants read" on public.battle_events for select using (
  exists (select 1 from public.battles where battles.id = battle_events.battle_id and auth.uid() in (battles.player_id, battles.opponent_id))
);

create policy "profile badges self read" on public.profile_badges for select using (auth.uid() = profile_id);

insert into storage.buckets (id, name, public)
values ('pet-assets', 'pet-assets', true)
on conflict (id) do nothing;

create policy "pet assets owner upload" on storage.objects for insert with check (
  bucket_id = 'pet-assets' and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "pet assets public read" on storage.objects for select using (bucket_id = 'pet-assets');

create index if not exists profiles_last_seen_at_idx on public.profiles (last_seen_at desc);
create index if not exists pets_valid_active_idx on public.pets (validation_status, active);
create index if not exists battles_status_idx on public.battles (status);
create index if not exists battles_mode_idx on public.battles (mode);
create index if not exists match_queue_status_idx on public.match_queue (status);
