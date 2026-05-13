import type { BattleMove } from "./types";

export const STARTER_MOVES: BattleMove[] = [
  {
    id: "quick-byte",
    name: "Quick Byte",
    affinity: "spark",
    category: "physical",
    power: 20,
    accuracy: 100,
    maxCharges: 28,
    priority: 1
  },
  {
    id: "stack-slam",
    name: "Stack Slam",
    affinity: "stone",
    category: "physical",
    power: 32,
    accuracy: 90,
    maxCharges: 18
  },
  {
    id: "cache-flare",
    name: "Cache Flare",
    affinity: "ember",
    category: "special",
    power: 27,
    accuracy: 95,
    maxCharges: 20,
    effect: { kind: "status", status: "burn", chance: 0.25, duration: 3 }
  },
  {
    id: "focus-loop",
    name: "Focus Loop",
    affinity: "glitch",
    category: "status",
    power: 0,
    accuracy: 100,
    maxCharges: 12,
    effect: { kind: "stage", stat: "special", stages: 1, target: "self" }
  }
];

export const MOVE_LIBRARY: BattleMove[] = [
  ...STARTER_MOVES,
  {
    id: "root-snare",
    name: "Root Snare",
    affinity: "leaf",
    category: "special",
    power: 24,
    accuracy: 95,
    maxCharges: 22,
    effect: { kind: "status", status: "stun", chance: 0.2, duration: 1 }
  },
  {
    id: "tidal-patch",
    name: "Tidal Patch",
    affinity: "aqua",
    category: "status",
    power: 0,
    accuracy: 100,
    maxCharges: 10,
    effect: { kind: "heal", percent: 0.22 }
  }
];
