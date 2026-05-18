import { NextResponse } from "next/server";
import { createBattleFromDb, type DbMove, type DbPet } from "@/lib/battle/db";
import { abandonUserActiveBattles, abandonUserStaleActiveBattles } from "@/lib/battle/lifecycle";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });
  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { petId?: string };
  if (!body.petId) return NextResponse.json({ error: "petId is required." }, { status: 400 });

  const staleError = await abandonUserStaleActiveBattles(supabase, user.id);
  if (staleError) return NextResponse.json({ error: staleError.message }, { status: 500 });

  const abandonError = await abandonUserActiveBattles(supabase, user.id, "A trainer left to find a new random fight.");
  if (abandonError) return NextResponse.json({ error: abandonError.message }, { status: 500 });

  await supabase.from("match_queue").delete().eq("user_id", user.id);

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_id, name, description, affinity, level, xp, stats, spritesheet_path")
    .eq("id", body.petId)
    .eq("owner_id", user.id)
    .single<DbPet>();
  if (petError || !pet) return NextResponse.json({ error: "Selected pet was not found." }, { status: 404 });

  const { data: opponentQueue } = await supabase
    .from("match_queue")
    .select("user_id, pet_id, created_at")
    .neq("user_id", user.id)
    .eq("status", "waiting")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string; pet_id: string; created_at: string }>();

  if (!opponentQueue) {
    await supabase.from("match_queue").upsert({ user_id: user.id, pet_id: body.petId, status: "waiting" });
    return NextResponse.json({ status: "waiting" });
  }

  const battle = await createBattle(supabase, {
    playerId: opponentQueue.user_id,
    playerPetId: opponentQueue.pet_id,
    opponentId: user.id,
    opponentPetId: body.petId
  });

  if ("error" in battle) return NextResponse.json({ error: battle.error }, { status: 500 });

  await supabase.from("match_queue").delete().in("user_id", [user.id, opponentQueue.user_id]);
  return NextResponse.json({ status: "matched", battleId: battle.id });
}

async function createBattle(
  supabase: NonNullable<Awaited<ReturnType<typeof getBearerUser>>["supabase"]>,
  input: { playerId: string; playerPetId: string; opponentId: string; opponentPetId: string }
) {
  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, owner_id, name, description, affinity, level, xp, stats, spritesheet_path")
    .in("id", [input.playerPetId, input.opponentPetId])
    .returns<DbPet[]>();
  if (petsError || !pets || pets.length !== 2) return { error: "Could not load matched pets." };

  const { data: moves, error: movesError } = await supabase
    .from("moves")
    .select("id, pet_id, slot, display_name, move_key, power, accuracy, category, affinity, max_charges, effect")
    .in("pet_id", [input.playerPetId, input.opponentPetId])
    .returns<DbMove[]>();
  if (movesError) return { error: "Could not load pet moves." };

  const playerPet = pets.find((pet) => pet.id === input.playerPetId)!;
  const opponentPet = pets.find((pet) => pet.id === input.opponentPetId)!;
  if (playerPet.owner_id !== input.playerId || opponentPet.owner_id !== input.opponentId) {
    return { error: "Matched pet ownership could not be verified." };
  }

  const state = createBattleFromDb(
    playerPet,
    moves?.filter((move) => move.pet_id === playerPet.id) ?? [],
    opponentPet,
    moves?.filter((move) => move.pet_id === opponentPet.id) ?? [],
    (path) => supabase.storage.from("pet-assets").getPublicUrl(path).data.publicUrl
  );

  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .insert({
      player_id: input.playerId,
      opponent_id: input.opponentId,
      player_pet_id: input.playerPetId,
      opponent_pet_id: input.opponentPetId,
      current_turn: state.turn,
      state,
      status: "active"
    })
    .select("id")
    .single<{ id: string }>();

  if (battleError || !battle) return { error: battleError?.message ?? "Could not create battle." };
  return battle;
}
