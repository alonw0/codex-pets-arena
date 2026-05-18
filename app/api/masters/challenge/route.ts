import { NextResponse } from "next/server";
import { createInitialBattle } from "@/lib/battle/engine";
import { dbPetToBattlePet, type DbMove, type DbPet } from "@/lib/battle/db";
import { abandonUserActiveBattles, abandonUserStaleActiveBattles } from "@/lib/battle/lifecycle";
import { getNpcMaster, npcMasterToBattlePet } from "@/lib/battle/masters";
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

  const profileError = await ensureProfile(supabase, user);
  mark("profile");
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { petId?: string; masterKey?: string };
  if (!body.petId || !body.masterKey) return NextResponse.json({ error: "petId and masterKey are required." }, { status: 400 });

  const master = getNpcMaster(body.masterKey);
  if (!master) return NextResponse.json({ error: "Master was not found." }, { status: 404 });

  const staleError = await abandonUserStaleActiveBattles(supabase, user.id);
  mark("stale-cleanup");
  if (staleError) return NextResponse.json({ error: staleError.message }, { status: 500 });

  const abandonError = await abandonUserActiveBattles(supabase, user.id, "A trainer left to challenge a master.");
  mark("active-cleanup");
  if (abandonError) return NextResponse.json({ error: abandonError.message }, { status: 500 });

  await supabase.from("match_queue").delete().eq("user_id", user.id);
  mark("queue-cleanup");

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_id, name, description, affinity, level, xp, stats, spritesheet_path")
    .eq("id", body.petId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .single<DbPet>();

  if (petError || !pet) return NextResponse.json({ error: "Selected pet was not found." }, { status: 404 });
  mark("pet-load");

  const { data: moves, error: movesError } = await supabase
    .from("moves")
    .select("id, pet_id, slot, display_name, move_key, power, accuracy, category, affinity, max_charges, effect")
    .eq("pet_id", pet.id)
    .returns<DbMove[]>();
  if (movesError) return NextResponse.json({ error: "Could not load pet moves." }, { status: 500 });
  mark("moves-load");

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
  return NextResponse.json({ battleId: battle.id });
}
