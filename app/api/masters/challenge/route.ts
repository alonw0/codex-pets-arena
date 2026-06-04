import { NextResponse } from "next/server";
import { createInitialBattle } from "@/lib/battle/engine";
import { dbPetToBattlePet, type DbMove, type DbPet } from "@/lib/battle/db";
import { abandonUserActiveBattlesFast } from "@/lib/battle/lifecycle";
import { getNpcMaster, npcMasterToBattlePet } from "@/lib/battle/masters";
import { assertUuid } from "@/lib/security/ids";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const mark = (label: string) => {
    timings[label] = Date.now() - startedAt;
  };

  const { supabase, user, error } = await getBearerUser(request);
  mark("auth");
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { petId?: string; masterKey?: string };
  if (!body.petId || !body.masterKey) return NextResponse.json({ error: "petId and masterKey are required." }, { status: 400 });
  let petId: string;
  try {
    petId = assertUuid(body.petId);
  } catch {
    return NextResponse.json({ error: "Invalid petId." }, { status: 400 });
  }

  const master = getNpcMaster(body.masterKey);
  if (!master) return NextResponse.json({ error: "Master was not found." }, { status: 404 });

  const profilePromise = ensureProfile(supabase, user);
  const cleanupPromise = abandonUserActiveBattlesFast(supabase, user.id);
  const queuePromise = supabase.from("match_queue").delete().eq("user_id", user.id);
  const petPromise = supabase
    .from("pets")
    .select("id, owner_id, name, description, affinity, level, xp, stats, spritesheet_path")
    .eq("id", petId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .single<DbPet>();
  const movesPromise = supabase
    .from("moves")
    .select("id, pet_id, slot, display_name, move_key, power, accuracy, category, affinity, max_charges, effect")
    .eq("pet_id", petId)
    .returns<DbMove[]>();

  const [profileError, abandonError, queueResult, petResult, movesResult] = await Promise.all([
    profilePromise,
    cleanupPromise,
    queuePromise,
    petPromise,
    movesPromise
  ]);
  mark("parallel-setup");

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (abandonError) return NextResponse.json({ error: abandonError.message }, { status: 500 });
  if (queueResult.error) return NextResponse.json({ error: queueResult.error.message }, { status: 500 });

  const pet = petResult.data;
  if (petResult.error || !pet) return NextResponse.json({ error: "Selected pet was not found." }, { status: 404 });

  const moves = movesResult.data;
  const movesError = movesResult.error;
  if (movesError) return NextResponse.json({ error: "Could not load pet moves." }, { status: 500 });

  const player = dbPetToBattlePet(pet, moves ?? [], supabase.storage.from("pet-assets").getPublicUrl(pet.spritesheet_path).data.publicUrl);
  const opponent = npcMasterToBattlePet(master);
  const state = createInitialBattle(player, opponent);
  state.activeSide = "player";
  state.log = [`Master ${master.name} stepped into the arena.`];

  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .insert({
      player_id: user.id,
      opponent_id: null,
      player_pet_id: pet.id,
      opponent_pet_id: null,
      mode: "npc",
      npc_master_key: master.key,
      current_turn: state.turn,
      state,
      status: "active"
    })
    .select("id")
    .single<{ id: string }>();

  if (battleError || !battle) return NextResponse.json({ error: battleError?.message ?? "Could not create master challenge." }, { status: 500 });
  mark("battle-insert");
  console.info("masters.challenge timings", { battleId: battle.id, totalMs: Date.now() - startedAt, timings });
  return NextResponse.json({
    battleId: battle.id,
    battle: {
      state,
      status: "active",
      mode: "npc",
      npc_master_key: master.key
    },
    side: "player",
    mode: "npc",
    npcMasterKey: master.key,
    spriteUrls: [player.spriteUrl, opponent.spriteUrl].filter(Boolean)
  });
}
