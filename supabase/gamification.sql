create table if not exists public.profile_badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  metadata jsonb not null default '{}',
  earned_at timestamptz not null default now(),
  unique (profile_id, badge_key)
);

alter table public.profile_badges enable row level security;

drop policy if exists "profile badges self read" on public.profile_badges;
create policy "profile badges self read" on public.profile_badges
for select
using (auth.uid() = profile_id);
