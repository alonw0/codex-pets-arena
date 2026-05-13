import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { supabase, user, error } = await getBearerUser(request);
  if (!supabase || !user) return NextResponse.json({ error }, { status: 401 });

  const { data: battle, error: battleError } = await supabase
    .from("battles")
    .select("id, updated_at")
    .or(`player_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; updated_at: string }>();

  if (battleError) return NextResponse.json({ error: battleError.message }, { status: 500 });
  return NextResponse.json({ battle });
}
