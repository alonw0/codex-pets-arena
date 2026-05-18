import { NextResponse } from "next/server";
import { createBattleFromDb, type DbMove, type DbPet } from "@/lib/battle/db";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });
  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { code?: string; petId?: string };
  if (!body.code || !body.petId) return NextResponse.json({ error: "code and petId are required." }, { status: 400 });

  const { data: lobby, error: lobbyError } = await supabase
    .from("lobbies")
    .select("*")
    .eq("code", body.code.toUpperCase())
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{ id: string; code: string; host_id: string; host_pet_id: string; guest_id: string | null }>();

  if (lobbyError || !lobby) return NextResponse.json({ error: "Lobby was not found or is no longer open." }, { status: 404 });
  if (lobby.host_id === user.id) return NextResponse.json({ error: "You cannot join your own lobby." }, { status: 400 });

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, owner_id, name, description, affinity, level, xp, stats, spritesheet_path")
    .in("id", [lobby.host_pet_id, body.petId])
    .returns<DbPet[]>();
  if (petsError || !pets || pets.length !== 2) return NextResponse.json({ error: "Could not load lobby pets." }, { status: 500 });

  const hostPet = pets.find((pet) => pet.id === lobby.host_pet_id && pet.owner_id === lobby.host_id);
  const guestPet = pets.find((pet) => pet.id === body.petId && pet.owner_id === user.id);
  if (!hostPet || !guestPet) return NextResponse.json({ error: "Lobby pet ownership could not be verified." }, { status: 403 });

  const { data: moves, error: movesError } = await supabase
    .from("moves")
    .select("id, pet_id, slot, display_name, move_key, power, accuracy, category, affinity, max_charges, effect")
    .in("pet_id", [lobby.host_pet_id, body.petId])
    .returns<DbMove[]>();
  if (movesError) return NextResponse.json({ error: "Could not load pet moves." }, { status: 500 });

  const state = createBattleFromDb(
    hostPet,
    moves?.filter((move) => move.pet_id === hostPet.id) ?? [],
    guestPet,
    moves?.filter((move) => move.pet_id === guestPet.id) ?? [],
    (path) => supabase.storage.from("pet-assets").getPublicUrl(path).data.publicUrl
  );

  const { data: claimedLobby, error: claimError } = await supabase
    .from("lobbies")
    .update({ guest_id: user.id, guest_pet_id: body.petId, status: "active" })
    .eq("id", lobby.id)
    .eq("status", "open")
    .is("guest_id", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (claimError || !claimedLobby) return NextResponse.json({ error: "Lobby was already claimed." }, { status: 409 });

  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .insert({
      player_id: lobby.host_id,
      opponent_id: user.id,
      player_pet_id: lobby.host_pet_id,
      opponent_pet_id: body.petId,
      current_turn: state.turn,
      state,
      status: "active"
    })
    .select("id")
    .single<{ id: string }>();

  if (battleError || !battle) {
    await supabase.from("lobbies").update({ guest_id: null, guest_pet_id: null, status: "open" }).eq("id", lobby.id);
    return NextResponse.json({ error: battleError?.message ?? "Could not create battle." }, { status: 500 });
  }

  return NextResponse.json({ battleId: battle.id });
}
