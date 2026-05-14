import { calculateDamage, createBattlePet } from "./engine";
import type { Affinity, BattleAction, BattleMove, BattlePet, BattleState, PetStats } from "./types";

export type NpcMaster = {
  key: string;
  name: string;
  title: string;
  description: string;
  difficulty: "Warm-up" | "Easy" | "Normal" | "Hard" | "Expert" | "Boss";
  affinity: Affinity;
  level: number;
  stats: PetStats;
  moves: BattleMove[];
  spriteUrl: string;
};

export const NPC_XP_MULTIPLIER = 0.5;

export const NPC_MASTERS: NpcMaster[] = [
  createMaster({
    key: "sam",
    name: "Sam",
    title: "First Gate Mentor",
    description: "A steady opening master who teaches clean timing, simple reads, and safe guard turns.",
    difficulty: "Warm-up",
    affinity: "spark",
    level: 1,
    spriteUrl: "/npc-masters/sam.webp",
    moveNames: ["Sam Jab", "Bright Ping"]
  }),
  createMaster({
    key: "goose",
    name: "Goose",
    title: "Waterline Trickster",
    description: "A slippery master who baits rushed attacks, slips away, and counters from odd angles.",
    difficulty: "Easy",
    affinity: "aqua",
    level: 2,
    spriteUrl: "/npc-masters/goose.webp",
    moveNames: ["Wing Feint", "Soft Reset"]
  }),
  createMaster({
    key: "mimi",
    name: "Mimi",
    title: "Garden Sprinter",
    description: "A bright, quick master who opens fast and keeps challengers guessing with leaf-aligned pressure.",
    difficulty: "Normal",
    affinity: "leaf",
    level: 3,
    spriteUrl: "/npc-masters/mimi.webp",
    moveNames: ["Mimi Loop", "Sprint Slice"]
  }),
  createMaster({
    key: "bunny",
    name: "Bunny",
    title: "Ember Jumper",
    description: "A bouncy pressure master who hops into range and lands sharp ember-powered bursts.",
    difficulty: "Hard",
    affinity: "ember",
    level: 5,
    spriteUrl: "/npc-masters/bunny.webp",
    moveNames: ["Bunny Hop", "Hot Patch"]
  }),
  createMaster({
    key: "longoma",
    name: "Longoma",
    title: "Old Stone Wall",
    description: "A heavy late-ladder master who absorbs weak hits and forces challengers to manage charges.",
    difficulty: "Expert",
    affinity: "stone",
    level: 8,
    spriteUrl: "/npc-masters/longoma.webp",
    moveNames: ["Long Guard", "Granite Push"]
  }),
  createMaster({
    key: "dev",
    name: "Dev",
    title: "Glitch Architect",
    description: "A boss master who bends the arena rules with strange attacks built to test veteran pets.",
    difficulty: "Boss",
    affinity: "glitch",
    level: 12,
    spriteUrl: "/npc-masters/dev.webp",
    moveNames: ["Dev Spike", "Memory Bend"]
  })
];

export function getNpcMaster(key: string) {
  return NPC_MASTERS.find((master) => master.key === key) ?? null;
}

export function npcMasterToBattlePet(master: NpcMaster): BattlePet {
  const pet = createBattlePet({
    id: `npc-${master.key}`,
    ownerId: "npc-masters",
    name: master.name,
    affinity: master.affinity,
    level: master.level,
    spriteUrl: master.spriteUrl
  });

  return {
    ...pet,
    stats: master.stats,
    currentHp: master.stats.hp,
    moves: master.moves
  };
}

export function chooseNpcAction(state: BattleState, seed: number): BattleAction {
  const npc = state.opponent;
  const player = state.player;
  if (npc.currentHp <= Math.ceil(npc.stats.hp * 0.25) && seededChoice(seed, 100) < 35) return { type: "guard" };

  const availableMoves = npc.moves.filter((move) => (state.charges[`${npc.id}:${move.id}`] ?? 0) > 0);
  if (!availableMoves.length) return { type: "guard" };

  const scored = availableMoves
    .map((move) => ({
      move,
      damage: calculateDamage(npc, player, move, seed + hashString(move.id))
    }))
    .sort((a, b) => b.damage - a.damage);

  const killMove = scored.find((candidate) => candidate.damage >= player.currentHp);
  return { type: "move", moveId: (killMove ?? scored[0]).move.id };
}

function createMaster(input: {
  key: string;
  name: string;
  title: string;
  description: string;
  difficulty: NpcMaster["difficulty"];
  affinity: Affinity;
  level: number;
  spriteUrl: string;
  moveNames: [string, string];
}): NpcMaster {
  const base = createBattlePet({ id: `npc-${input.key}`, ownerId: "npc-masters", name: input.name, affinity: input.affinity, level: input.level });
  return {
    ...input,
    stats: base.stats,
    moves: [
      {
        id: `${input.key}-strike`,
        name: input.moveNames[0],
        affinity: input.affinity,
        category: "physical",
        power: 22 + Math.min(10, input.level),
        accuracy: 95,
        maxCharges: 24
      },
      {
        id: `${input.key}-burst`,
        name: input.moveNames[1],
        affinity: input.affinity,
        category: "special",
        power: 28 + Math.min(12, input.level),
        accuracy: 88,
        maxCharges: 16
      }
    ]
  };
}

function seededChoice(seed: number, max: number) {
  return Math.abs((seed * 1103515245 + 12345) % max);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}
