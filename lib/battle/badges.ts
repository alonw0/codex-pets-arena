import type { SupabaseClient } from "@supabase/supabase-js";
import type { BattlePet } from "./types";

export type BadgeKey =
  | "first-upload"
  | "first-win"
  | "hot-streak"
  | "comeback"
  | "collector"
  | "rivalry"
  | "veteran";

export type BadgeDefinition = {
  key: BadgeKey;
  label: string;
  title: string;
  description: string;
};

export type EarnedBadge = BadgeDefinition & {
  earned_at?: string;
};

export const BADGES: Record<BadgeKey, BadgeDefinition> = {
  "first-upload": {
    key: "first-upload",
    label: "First Upload",
    title: "Pet Handler",
    description: "Uploaded the first arena pet."
  },
  "first-win": {
    key: "first-win",
    label: "First Win",
    title: "Rookie Victor",
    description: "Won the first battle."
  },
  "hot-streak": {
    key: "hot-streak",
    label: "Hot Streak",
    title: "Streak Starter",
    description: "Reached 3 wins."
  },
  comeback: {
    key: "comeback",
    label: "Comeback",
    title: "Clutch Trainer",
    description: "Won while the winning pet was under 20% HP."
  },
  collector: {
    key: "collector",
    label: "Collector",
    title: "Pet Collector",
    description: "Uploaded 5 pets."
  },
  rivalry: {
    key: "rivalry",
    label: "Rivalry",
    title: "Rival Breaker",
    description: "Beat the same opponent twice."
  },
  veteran: {
    key: "veteran",
    label: "Veteran",
    title: "Arena Veteran",
    description: "Reached 10 wins."
  }
};

export function hydrateBadge(key: string, earnedAt?: string): EarnedBadge | null {
  const badge = BADGES[key as BadgeKey];
  return badge ? { ...badge, earned_at: earnedAt } : null;
}

export async function awardPetUploadBadges(supabase: SupabaseClient, profileId: string) {
  const { count } = await supabase
    .from("pets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profileId)
    .eq("active", true);

  const keys: BadgeKey[] = ["first-upload"];
  if ((count ?? 0) >= 5) keys.push("collector");

  return awardBadges(supabase, profileId, keys);
}

export async function awardBattleBadges(
  supabase: SupabaseClient,
  input: {
    battleId: string;
    winnerId: string;
    loserId: string;
    winnerPet: BattlePet;
    winnerWins: number;
  }
) {
  const keys: BadgeKey[] = [];
  if (input.winnerWins >= 1) keys.push("first-win");
  if (input.winnerWins >= 3) keys.push("hot-streak");
  if (input.winnerWins >= 10) keys.push("veteran");
  if (input.winnerPet.currentHp <= Math.ceil(input.winnerPet.stats.hp * 0.2)) keys.push("comeback");

  const { count: rivalryWins } = await supabase
    .from("battles")
    .select("id", { count: "exact", head: true })
    .eq("status", "complete")
    .eq("winner_id", input.winnerId)
    .or(`and(player_id.eq.${input.winnerId},opponent_id.eq.${input.loserId}),and(player_id.eq.${input.loserId},opponent_id.eq.${input.winnerId})`);

  if ((rivalryWins ?? 0) >= 2) keys.push("rivalry");

  return awardBadges(supabase, input.winnerId, keys, { battle_id: input.battleId });
}

async function awardBadges(supabase: SupabaseClient, profileId: string, keys: BadgeKey[], metadata: Record<string, unknown> = {}) {
  const uniqueKeys = Array.from(new Set(keys));
  if (!uniqueKeys.length) return [];

  const { data: existing } = await supabase
    .from("profile_badges")
    .select("badge_key")
    .eq("profile_id", profileId)
    .in("badge_key", uniqueKeys);

  const existingKeys = new Set((existing ?? []).map((row) => row.badge_key as string));
  const newKeys = uniqueKeys.filter((key) => !existingKeys.has(key));
  if (!newKeys.length) return [];

  const now = new Date().toISOString();
  const { error } = await supabase.from("profile_badges").insert(
    newKeys.map((key) => ({
      profile_id: profileId,
      badge_key: key,
      metadata,
      earned_at: now
    }))
  );

  if (error) throw error;
  return newKeys.map((key) => ({ ...BADGES[key], earned_at: now }));
}
