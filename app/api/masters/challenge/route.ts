import { NextResponse } from "next/server";
import { createInitialBattle } from "@/lib/battle/engine";
import { dbPetToBattlePet, type DbMove, type DbPet } from "@/lib/battle/db";
import { abandonStaleActiveBattles, abandonUserActiveBattles } from "@/lib/battle/lifecycle";
import { getNpcMaster, npcMasterToBattlePet } from "@/lib/battle/masters";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { petId?: string; masterKey?: string };
  if (!body.petId || !body.masterKey) return NextResponse.json({ error: "petId and masterKey are required." }, { status: 400 });

  const master = getNpcMaster(body.masterKey);
  if (!master) return NextResponse.json({ error: "Master was not found." }, { status: 404 });

  const staleError = await abandonStaleActiveBattles(supabase);
  if (staleError) return NextResponse.json({ error: staleError.message }, { status: 500 });

  const abandonError = await abandonUserActiveBattles(supabase, user.id, "A trainer left to challenge a master.");
  if (abandonError) return NextResponse.json({ error: abandonError.message }, { status: 500 });

  await supabase.from("match_queue").delete().eq("user_id", user.id);

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("*")
    .eq("id", body.petId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .single<DbPet>();

  if (petError || !pet) return NextResponse.json({ error: "Selected pet was not found." }, { status: 404 });

  const { data: moves, error: movesError } = await supabase.from("moves").select("*").eq("pet_id", pet.id).returns<DbMove[]>();
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
  return NextResponse.json({ battleId: battle.id });
}
