import { createBattlePet, createInitialBattle } from "./engine";
import { personalMoveRecordToBattleMove, type PersonalMoveRecord } from "./personalMoves";
import type { Affinity, BattleAction, BattlePet, BattleState, MoveCategory, PetStats } from "./types";

export type DbPet = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  affinity: Affinity;
  level: number;
  xp: number;
  stats: PetStats;
  spritesheet_path: string;
};

export type DbMove = {
  id: string;
  pet_id: string;
  slot: number;
  display_name: string;
  move_key: string;
  power: number;
  accuracy: number;
  category: MoveCategory;
  affinity: Affinity;
  max_charges: number;
  effect: null;
};

export function dbPetToBattlePet(pet: DbPet, moves: DbMove[], spriteUrl?: string): BattlePet {
  const isLegacyHighHpPet = pet.level <= 5 && pet.stats.hp > 70;
  const battleLevel = isLegacyHighHpPet ? 1 : pet.level;
  const fallback = createBattlePet({
    id: pet.id,
    ownerId: pet.owner_id,
    name: pet.name,
    affinity: pet.affinity,
    level: battleLevel,
    spriteUrl
  });

  return {
    ...fallback,
    xp: isLegacyHighHpPet ? 0 : pet.xp,
    stats: isLegacyHighHpPet ? fallback.stats : pet.stats,
    currentHp: isLegacyHighHpPet ? fallback.stats.hp : pet.stats.hp,
    moves: moves.length
      ? moves
          .sort((a, b) => a.slot - b.slot)
          .slice(0, 2)
          .map((move) => personalMoveRecordToBattleMove(dbMoveToPersonalMove(move)))
      : fallback.moves.filter((move) => move.category !== "status").slice(0, 2)
  };
}

export function createBattleFromDb(playerPet: DbPet, playerMoves: DbMove[], opponentPet: DbPet, opponentMoves: DbMove[], getSpriteUrl: (path: string) => string): BattleState {
  return createInitialBattle(
    dbPetToBattlePet(playerPet, playerMoves, getSpriteUrl(playerPet.spritesheet_path)),
    dbPetToBattlePet(opponentPet, opponentMoves, getSpriteUrl(opponentPet.spritesheet_path))
  );
}

export function normalizeBattleAction(value: unknown): BattleAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Partial<BattleAction>;
  if (action.type === "guard" || action.type === "yield" || action.type === "focus") return { type: action.type };
  if (action.type === "move" && typeof action.moveId === "string") return { type: "move", moveId: action.moveId };
  return null;
}

function dbMoveToPersonalMove(move: DbMove): PersonalMoveRecord {
  return {
    display_name: move.display_name,
    move_key: move.move_key,
    power: move.power,
    accuracy: move.accuracy,
    category: move.category,
    affinity: move.affinity,
    max_charges: move.max_charges,
    effect: null
  };
}
