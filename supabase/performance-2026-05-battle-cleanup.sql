create index if not exists battles_active_updated_idx on public.battles (status, updated_at);
create index if not exists battles_player_active_idx on public.battles (player_id, status, updated_at desc);
create index if not exists battles_opponent_active_idx on public.battles (opponent_id, status, updated_at desc);
create index if not exists battles_player_pet_active_idx on public.battles (player_pet_id, status);
create index if not exists battles_opponent_pet_active_idx on public.battles (opponent_pet_id, status);
create index if not exists match_queue_waiting_created_idx on public.match_queue (status, created_at);
create index if not exists lobbies_code_status_idx on public.lobbies (code, status);
create index if not exists battle_events_battle_id_id_idx on public.battle_events (battle_id, id desc);
