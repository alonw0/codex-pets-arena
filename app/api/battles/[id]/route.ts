import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await params;
  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .select("id, player_id, opponent_id, state, status, mode, npc_master_key")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      player_id: string;
      opponent_id: string | null;
      state: unknown;
      status?: string;
      mode?: string;
      npc_master_key?: string | null;
    }>();
  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.player_id !== user.id && battle.opponent_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });

  const { data: events } = await supabase
    .from("battle_events")
    .select("id, event")
    .eq("battle_id", id)
    .order("id", { ascending: false })
    .limit(16)
    .returns<Array<{ id: number; event: unknown }>>();
  return NextResponse.json({
    battle,
    events: (events ?? []).reverse(),
    side: battle.player_id === user.id ? "player" : "opponent",
    mode: battle.mode ?? "pvp",
    npcMasterKey: battle.npc_master_key ?? null
  });
}
