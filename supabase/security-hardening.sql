drop policy if exists "pets owner insert" on public.pets;
drop policy if exists "pets owner update" on public.pets;
drop policy if exists "moves owner write" on public.moves;
drop policy if exists "moves owner insert" on public.moves;
drop policy if exists "queue self" on public.match_queue;
drop policy if exists "lobbies host create" on public.lobbies;
drop policy if exists "lobbies participants update" on public.lobbies;
drop policy if exists "battles participants update" on public.battles;
drop policy if exists "turns participants insert" on public.battle_turns;
drop policy if exists "queue self read" on public.match_queue;

create policy "queue self read" on public.match_queue
for select
using (auth.uid() = user_id);
