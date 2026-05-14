import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await params;
  const { data: battle, error: battleError } = await supabase.from("battles").select("*").eq("id", id).maybeSingle();
  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.player_id !== user.id && battle.opponent_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });

  const { data: events } = await supabase.from("battle_events").select("*").eq("battle_id", id).order("id", { ascending: true });
  return NextResponse.json({
    battle,
    events: events ?? [],
    side: battle.player_id === user.id ? "player" : "opponent",
    mode: battle.mode ?? "pvp",
    npcMasterKey: battle.npc_master_key ?? null
  });
}
