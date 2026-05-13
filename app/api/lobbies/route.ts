import { NextResponse } from "next/server";
import { ensureProfile, getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });
  const profileError = await ensureProfile(supabase, user);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { petId?: string };
  if (!body.petId) return NextResponse.json({ error: "petId is required." }, { status: 400 });

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", body.petId)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle<{ id: string }>();

  if (petError || !pet) return NextResponse.json({ error: "Selected pet was not found." }, { status: 404 });

  const code = createLobbyCode();
  const { data, error: lobbyError } = await supabase
    .from("lobbies")
    .insert({
      code,
      host_id: user.id,
      host_pet_id: body.petId,
      status: "open"
    })
    .select("id, code")
    .single<{ id: string; code: string }>();

  if (lobbyError || !data) return NextResponse.json({ error: lobbyError?.message ?? "Could not create lobby." }, { status: 500 });
  return NextResponse.json({ lobby: data });
}

function createLobbyCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
