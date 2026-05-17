import { NextResponse } from "next/server";
import { ensureActiveSide, resolveActiveTurn } from "@/lib/battle/engine";
import { chooseNpcAction } from "@/lib/battle/masters";
import { incrementProfileResult } from "@/lib/battle/profileStats";
import type { BattleState } from "@/lib/battle/types";
import { getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await params;
  const { data: battle, error: battleError } = await supabase.from("battles").select("*").eq("id", id).maybeSingle<{
    id: string;
    player_id: string;
    mode?: "pvp" | "npc";
    current_turn: number;
    state: BattleState;
    status: string;
  }>();

  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.player_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });
  if ((battle.mode ?? "pvp") !== "npc") return NextResponse.json({ error: "This is not a master challenge." }, { status: 409 });
  if (battle.status !== "active") return NextResponse.json({ error: "Battle is not active." }, { status: 409 });

  const state = ensureActiveSide(battle.state);
  if (state.activeSide !== "opponent") {
    return NextResponse.json({ status: "not-needed", state, activeSide: state.activeSide });
  }

  const seed = Math.floor(Math.random() * 1_000_000_000);
  const action = chooseNpcAction(state, seed);
  const resolved = resolveActiveTurn(state, action, seed, { xpMultiplier: 0 });
  const isComplete = Boolean(resolved.state.winner);

  const { error: turnError } = await supabase.from("battle_turns").insert({
    battle_id: id,
    turn_number: battle.current_turn,
    opponent_action: action,
    rng_seed: seed,
    timeout_flags: {},
    resolved_log: resolved.events
  });
  if (turnError) return NextResponse.json({ error: turnError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("battles")
    .update({
      current_turn: resolved.state.turn,
      state: resolved.state,
      updated_at: new Date().toISOString(),
      status: isComplete ? "complete" : "active",
      winner_id: null,
      completed_at: isComplete ? new Date().toISOString() : null
    })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (resolved.state.winner === "opponent") {
    const lossPersist = await incrementProfileResult(supabase, battle.player_id, "losses");
    if (lossPersist.error) return NextResponse.json({ error: lossPersist.error.message }, { status: 500 });
  }

  if (resolved.events.length) {
    await supabase.from("battle_events").insert(
      resolved.events.map((event) => ({
        battle_id: id,
        turn_number: battle.current_turn,
        event
      }))
    );
  }

  return NextResponse.json({ status: "resolved", state: resolved.state, events: resolved.events, activeSide: resolved.state.activeSide });
}
