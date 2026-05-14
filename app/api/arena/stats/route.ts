import { NextResponse } from "next/server";
import { getArenaStats } from "@/lib/arena/stats";

export async function GET() {
  const stats = await getArenaStats();
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
    }
  });
}
