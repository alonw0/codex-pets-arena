alter table public.battles
alter column opponent_id drop not null,
alter column opponent_pet_id drop not null;

alter table public.battles
add column if not exists mode text not null default 'pvp',
add column if not exists npc_master_key text;

alter table public.battles
drop constraint if exists battles_mode_check;

alter table public.battles
add constraint battles_mode_check check (mode in ('pvp', 'npc'));

drop policy if exists "battles participants read" on public.battles;
create policy "battles participants read" on public.battles
for select
using (auth.uid() = player_id or auth.uid() = opponent_id);

create index if not exists battles_mode_idx on public.battles (mode);
