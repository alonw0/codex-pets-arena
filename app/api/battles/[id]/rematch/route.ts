import { NextResponse } from "next/server";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const { id } = await params;
  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .select("id, player_id, opponent_id, player_pet_id, opponent_pet_id, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      player_id: string;
      opponent_id: string;
      player_pet_id: string;
      opponent_pet_id: string;
      status: string;
    }>();

  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.player_id !== user.id && battle.opponent_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });
  if (battle.status !== "complete" && battle.status !== "abandoned") return NextResponse.json({ error: "Rematch is available after the fight ends." }, { status: 409 });

  const petId = battle.player_id === user.id ? battle.player_pet_id : battle.opponent_pet_id;
  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (petError || !pet) return NextResponse.json({ error: "Your rematch pet is no longer available." }, { status: 404 });

  const code = createLobbyCode();
  const { data: lobby, error: lobbyError } = await supabase
    .from("lobbies")
    .insert({
      code,
      host_id: user.id,
      host_pet_id: petId,
      status: "open"
    })
    .select("id, code")
    .single<{ id: string; code: string }>();

  if (lobbyError || !lobby) return NextResponse.json({ error: lobbyError?.message ?? "Could not create rematch lobby." }, { status: 500 });
  return NextResponse.json({ lobby });
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
