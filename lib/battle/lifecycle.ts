import type { SupabaseClient } from "@supabase/supabase-js";

export const STALE_ACTIVE_BATTLE_MINUTES = 30;

type BattleParticipantRow = {
  id: string;
  player_id: string;
  opponent_id: string;
  updated_at: string;
  state?: { log?: string[] };
};

export async function abandonUserActiveBattles(
  supabase: SupabaseClient,
  userId: string,
  reason = "A trainer left the fight."
) {
  const { data: battles, error } = await supabase
    .from("battles")
    .select("id, player_id, opponent_id, updated_at, state")
    .or(`player_id.eq.${userId},opponent_id.eq.${userId}`)
    .eq("status", "active")
    .returns<BattleParticipantRow[]>();

  if (error) return error;
  if (!battles?.length) return null;

  const completedAt = new Date().toISOString();
  const updates = battles.map((battle) => {
    const state = battle.state
      ? {
          ...battle.state,
          log: [...(battle.state.log ?? []), reason].slice(-10)
        }
      : battle.state;

    return supabase
      .from("battles")
      .update({
        status: "abandoned",
        state,
        updated_at: completedAt,
        completed_at: completedAt
      })
      .eq("id", battle.id);
  });

  const results = await Promise.all(updates);
  return results.find((result) => result.error)?.error ?? null;
}

export async function abandonStaleActiveBattles(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - STALE_ACTIVE_BATTLE_MINUTES * 60_000).toISOString();
  const { error } = await supabase
    .from("battles")
    .update({
      status: "abandoned",
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
    .eq("status", "active")
    .lt("updated_at", cutoff);

  return error ?? null;
}
