import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type ArenaStats = {
  pets: number;
  trainers: number;
  online: number;
  activeBattles: number;
  waitingTrainers: number;
  generatedAt: string;
};

const ZERO_STATS: ArenaStats = {
  pets: 0,
  trainers: 0,
  online: 0,
  activeBattles: 0,
  waitingTrainers: 0,
  generatedAt: new Date(0).toISOString()
};

const STATS_TTL_MS = 30_000;
let cachedStats: { expiresAt: number; value: ArenaStats } | null = null;

export async function getArenaStats(): Promise<ArenaStats> {
  if (cachedStats && cachedStats.expiresAt > Date.now()) return cachedStats.value;

  const supabase = createSupabaseServiceClient();
  if (!supabase) return cacheStats({ ...ZERO_STATS, generatedAt: new Date().toISOString() });

  const onlineSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [pets, trainers, online, activeBattles, waitingTrainers] = await Promise.all([
    supabase
      .from("pets")
      .select("*", { count: "exact", head: true })
      .eq("active", true)
      .eq("validation_status", "valid"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gt("last_seen_at", onlineSince),
    supabase.from("battles").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("match_queue").select("*", { count: "exact", head: true }).eq("status", "waiting")
  ]);

  return cacheStats({
    pets: safeCount(pets.count, pets.error),
    trainers: safeCount(trainers.count, trainers.error),
    online: safeCount(online.count, online.error),
    activeBattles: safeCount(activeBattles.count, activeBattles.error),
    waitingTrainers: safeCount(waitingTrainers.count, waitingTrainers.error),
    generatedAt: new Date().toISOString()
  });
}

function cacheStats(value: ArenaStats) {
  cachedStats = { expiresAt: Date.now() + STATS_TTL_MS, value };
  return value;
}

function safeCount(count: number | null, error: { message?: string } | null) {
  if (error || typeof count !== "number") return 0;
  return count;
}
