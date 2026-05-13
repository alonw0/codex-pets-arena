import { createBattlePet, createInitialBattle } from "@/lib/battle/engine";

export const demoPlayer = createBattlePet({
  id: "pet-local",
  ownerId: "local",
  name: "RanSec",
  affinity: "spark",
  spriteUrl: "/demo-pets/ransec.webp"
});

export const demoOpponent = createBattlePet({
  id: "pet-rival",
  ownerId: "rival",
  name: "Miss Minutes",
  affinity: "glitch",
  spriteUrl: "/demo-pets/miss-minutes.webp"
});

export function createDemoBattle() {
  return createInitialBattle(demoPlayer, demoOpponent);
}
