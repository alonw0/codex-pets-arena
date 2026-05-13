import type { BattlePet, PetStats } from "./types";

export type ProgressionResult = {
  xpGained: number;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  nextLevelXp: number;
};

export function xpForDefeat(winner: BattlePet, defeated: BattlePet): number {
  const levelGap = Math.max(-5, Math.min(8, defeated.level - winner.level));
  return Math.max(12, 24 + defeated.level * 8 + levelGap * 5);
}

export function xpForNextLevel(level: number): number {
  return level * level * 12;
}

export function applyBattleProgression(winner: BattlePet, defeated: BattlePet): ProgressionResult {
  const oldLevel = winner.level;
  const xpGained = xpForDefeat(winner, defeated);
  winner.xp += xpGained;

  let leveledUp = false;
  while (winner.xp >= xpForNextLevel(winner.level)) {
    winner.xp -= xpForNextLevel(winner.level);
    winner.level += 1;
    leveledUp = true;
  }

  if (leveledUp) {
    const oldHp = winner.stats.hp;
    winner.stats = growStats(winner.stats, winner.level - oldLevel);
    winner.currentHp = Math.min(winner.stats.hp, winner.currentHp + Math.max(0, winner.stats.hp - oldHp));
  }

  return {
    xpGained,
    leveledUp,
    oldLevel,
    newLevel: winner.level,
    nextLevelXp: xpForNextLevel(winner.level)
  };
}

function growStats(stats: PetStats, levelsGained: number): PetStats {
  return {
    hp: stats.hp + levelsGained * 5,
    attack: stats.attack + levelsGained * 2,
    defense: stats.defense + levelsGained * 2,
    special: stats.special + levelsGained * 2,
    speed: stats.speed + levelsGained * 2
  };
}
