import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { id } = await params;
  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .select("id, player_id, opponent_id, status, state")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      player_id: string;
      opponent_id: string;
      status: string;
      state: { log?: string[] };
    }>();

  if (battleError || !battle) return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  if (battle.player_id !== user.id && battle.opponent_id !== user.id) return NextResponse.json({ error: "Not a battle participant." }, { status: 403 });
  if (battle.status !== "active") return NextResponse.json({ status: battle.status });

  const completedAt = new Date().toISOString();
  const state = {
    ...battle.state,
    log: [...(battle.state.log ?? []), "A trainer left the fight."].slice(-10)
  };

  const { error: updateError } = await supabase
    .from("battles")
    .update({
      status: "abandoned",
      state,
      updated_at: completedAt,
      completed_at: completedAt
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("battle_events").insert({
    battle_id: id,
    turn_number: 0,
    event: { kind: "message", text: "A trainer left the fight." }
  });

  return NextResponse.json({ status: "abandoned" });
}
