import { NextResponse } from "next/server";
import { awardBattleBadges } from "@/lib/battle/badges";
import { ensureActiveSide, resolveActiveTurn } from "@/lib/battle/engine";
import { normalizeBattleAction } from "@/lib/battle/db";
import { chooseNpcAction, NPC_XP_MULTIPLIER } from "@/lib/battle/masters";
import { incrementProfileResult } from "@/lib/battle/profileStats";
import type { BattleAction, BattleState } from "@/lib/battle/types";
import { getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = normalizeBattleAction(body.action);
  if (!action) return NextResponse.json({ error: "Valid action is required." }, { status: 400 });

  const { data: battle, error: battleError } = await supabase.from("battles").select("*").eq("id", id).maybeSingle<{
    id: string;
    player_id: string;
    opponent_id: string | null;
    player_pet_id: string;
    opponent_pet_id: string | null;
    mode?: "pvp" | "npc";
    npc_master_key?: string | null;
    current_turn: number;
    state: BattleState;
    status: string;
  }>();

  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.status !== "active") return NextResponse.json({ error: "Battle is not active." }, { status: 409 });
  if (battle.player_id !== user.id && battle.opponent_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });

  const side = battle.player_id === user.id ? "player" : "opponent";
  const battleState = ensureActiveSide(battle.state);
  if (battleState.activeSide !== side) {
    return NextResponse.json({ error: "It is not your turn.", state: battleState, activeSide: battleState.activeSide }, { status: 409 });
  }
  const turnNumber = battle.current_turn;

  const { data: existingTurn } = await supabase
    .from("battle_turns")
    .select("*")
    .eq("battle_id", id)
    .eq("turn_number", turnNumber)
    .maybeSingle<{
      id: string;
      player_action: BattleAction | null;
      opponent_action: BattleAction | null;
      resolved_log: unknown | null;
      rng_seed: number;
    }>();

  if (existingTurn?.resolved_log) {
    return NextResponse.json({ error: "Turn is already resolved." }, { status: 409 });
  }

  if (existingTurn?.[`${side}_action` as "player_action" | "opponent_action"]) {
    return NextResponse.json({ error: "Action already submitted for this turn." }, { status: 409 });
  }

  const turnPatch = side === "player" ? { player_action: action } : { opponent_action: action };
  const seed = Math.floor(Math.random() * 1_000_000_000);

  const { data: turn, error: turnError } = existingTurn
    ? await supabase.from("battle_turns").update(turnPatch).eq("id", existingTurn.id).select("*").single()
    : await supabase
        .from("battle_turns")
        .insert({ battle_id: id, turn_number: turnNumber, rng_seed: seed, timeout_flags: {}, ...turnPatch })
        .select("*")
        .single();

  if (turnError || !turn) return NextResponse.json({ error: turnError?.message ?? "Could not submit action." }, { status: 500 });

  const mode = battle.mode ?? "pvp";
  const resolved = resolveActiveTurn(battleState, action, seed, { xpMultiplier: mode === "npc" && side === "player" ? NPC_XP_MULTIPLIER : 1 });
  const eventRows = resolved.events.map((event) => ({ battle_id: id, turn_number: turnNumber, event }));

  if (mode === "npc" && !resolved.state.winner && resolved.state.activeSide === "opponent") {
    const npcTurnNumber = resolved.state.turn;
    const npcSeed = Math.floor(Math.random() * 1_000_000_000);
    const npcAction = chooseNpcAction(resolved.state, npcSeed);
    const npcResolved = resolveActiveTurn(resolved.state, npcAction, npcSeed, { xpMultiplier: 0 });
    resolved.state = npcResolved.state;
    resolved.events.push(...npcResolved.events);
    eventRows.push(...npcResolved.events.map((event) => ({ battle_id: id, turn_number: npcTurnNumber, event })));

    await supabase.from("battle_turns").insert({
      battle_id: id,
      turn_number: npcTurnNumber,
      opponent_action: npcAction,
      rng_seed: npcSeed,
      timeout_flags: {},
      resolved_log: npcResolved.events
    });
  }

  const winnerId = resolved.state.winner === "player" ? battle.player_id : resolved.state.winner === "opponent" ? battle.opponent_id : null;
  const isComplete = Boolean(resolved.state.winner);
  const updates = {
    current_turn: resolved.state.turn,
    state: resolved.state,
    updated_at: new Date().toISOString(),
    status: isComplete ? "complete" : "active",
    winner_id: winnerId,
    completed_at: isComplete ? new Date().toISOString() : null
  };

  const { error: battleUpdateError } = await supabase.from("battles").update(updates).eq("id", id);
  if (battleUpdateError) return NextResponse.json({ error: battleUpdateError.message }, { status: 500 });

  if (winnerId && mode === "pvp") {
    const winnerPet = resolved.state.winner === "player" ? resolved.state.player : resolved.state.opponent;
    const loserId = winnerId === battle.player_id ? battle.opponent_id : battle.player_id;
    const winnerPetId = resolved.state.winner === "player" ? battle.player_pet_id : battle.opponent_pet_id;
    if (!loserId || !winnerPetId) return NextResponse.json({ error: "PvP battle is missing participant data." }, { status: 500 });

    const [petPersist, winPersist, lossPersist] = await Promise.all([
      supabase
        .from("pets")
        .update({
          level: winnerPet.level,
          xp: winnerPet.xp,
          stats: winnerPet.stats
        })
        .eq("id", winnerPetId),
      incrementProfileResult(supabase, winnerId, "wins"),
      incrementProfileResult(supabase, loserId, "losses")
    ]);

    const persistError = petPersist.error ?? winPersist.error ?? lossPersist.error;
    if (persistError) return NextResponse.json({ error: persistError.message }, { status: 500 });

    const winnerWins = winPersist.value ?? 0;
    const badges = await awardBattleBadges(supabase, {
      battleId: id,
      winnerId,
      loserId,
      winnerPet,
      winnerWins
    });
    for (const badge of badges) {
      resolved.events.push({
        kind: "badge",
        target: resolved.state.winner ?? "player",
        badgeKey: badge.key,
        label: badge.label,
        title: badge.title
      });
    }
  }

  if (mode === "npc" && resolved.state.winner === "player") {
    const winnerPet = resolved.state.player;
    const [petPersist, winPersist] = await Promise.all([
      supabase
        .from("pets")
        .update({
          level: winnerPet.level,
          xp: winnerPet.xp,
          stats: winnerPet.stats
        })
        .eq("id", battle.player_pet_id),
      incrementProfileResult(supabase, battle.player_id, "wins")
    ]);
    const persistError = petPersist.error ?? winPersist.error;
    if (persistError) return NextResponse.json({ error: persistError.message }, { status: 500 });
  }

  if (mode === "npc" && resolved.state.winner === "opponent") {
    const lossPersist = await incrementProfileResult(supabase, battle.player_id, "losses");
    if (lossPersist.error) return NextResponse.json({ error: lossPersist.error.message }, { status: 500 });
  }

  await supabase.from("battle_turns").update({ resolved_log: resolved.events }).eq("id", turn.id);
  if (eventRows.length) {
    await supabase.from("battle_events").insert(eventRows);
  }

  return NextResponse.json({ status: "resolved", state: resolved.state, events: resolved.events, activeSide: resolved.state.activeSide, mode });
}
