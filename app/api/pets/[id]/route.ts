import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid pet id." }, { status: 400 });

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_id, active")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string; owner_id: string; active: boolean }>();

  if (petError) return NextResponse.json({ error: petError.message }, { status: 500 });
  if (!pet) return NextResponse.json({ error: "Pet not found." }, { status: 404 });
  if (!pet.active) return NextResponse.json({ removed: true });

  const { data: activeBattle, error: battleError } = await supabase
    .from("battles")
    .select("id")
    .eq("status", "active")
    .or(`player_pet_id.eq.${id},opponent_pet_id.eq.${id}`)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (battleError) return NextResponse.json({ error: battleError.message }, { status: 500 });
  if (activeBattle) {
    return NextResponse.json({ error: "Finish or leave the active battle before removing this pet." }, { status: 409 });
  }

  const { data: removedPet, error: removeError } = await supabase
    .from("pets")
    .update({ active: false })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("active", true)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });
  if (!removedPet) return NextResponse.json({ error: "Pet not found." }, { status: 404 });

  await supabase.from("match_queue").delete().eq("user_id", user.id).eq("pet_id", id);
  await supabase.from("lobbies").update({ status: "closed" }).eq("host_id", user.id).eq("host_pet_id", id).eq("status", "open");

  return NextResponse.json({ removed: true });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
