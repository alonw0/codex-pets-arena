import { STARTER_MOVES } from "./moves";
import { applyBattleProgressionWithMultiplier } from "./progression";
import type {
  Affinity,
  BattleAction,
  BattleMove,
  BattlePet,
  BattleSide,
  BattleState,
  BattleStatus,
  PetStats,
  ResolvedTurn,
  StatKey,
  TurnEvent,
  TurnInput
} from "./types";

const AFFINITY_CHART: Record<Affinity, Partial<Record<Affinity, number>>> = {
  spark: { aqua: 1.35, stone: 0.75, glitch: 1.15 },
  leaf: { aqua: 1.35, ember: 0.75, stone: 1.15 },
  ember: { leaf: 1.35, aqua: 0.75, glitch: 1.15 },
  aqua: { ember: 1.35, spark: 0.75, stone: 1.15 },
  stone: { spark: 1.35, leaf: 0.75, ember: 1.15 },
  glitch: { stone: 1.35, leaf: 0.75, spark: 1.15 }
};

const STAGE_MULTIPLIERS: Record<number, number> = {
  "-6": 0.25,
  "-5": 0.29,
  "-4": 0.33,
  "-3": 0.4,
  "-2": 0.5,
  "-1": 0.67,
  0: 1,
  1: 1.5,
  2: 2,
  3: 2.5,
  4: 3,
  5: 3.5,
  6: 4
};

export function createBattlePet(input: {
  id: string;
  ownerId: string;
  name: string;
  affinity?: Affinity;
  level?: number;
  spriteUrl?: string;
}): BattlePet {
  const affinity = input.affinity ?? pickAffinity(input.name);
  const level = input.level ?? 1;
  const stats = statsForPet(input.name, level);

  return {
    id: input.id,
    ownerId: input.ownerId,
    name: input.name,
    affinity,
    level,
    xp: 0,
    stats,
    currentHp: stats.hp,
    stages: { attack: 0, defense: 0, special: 0, speed: 0 },
    statuses: {},
    moves: STARTER_MOVES,
    spriteUrl: input.spriteUrl
  };
}

export function createInitialBattle(player: BattlePet, opponent: BattlePet): BattleState {
  const charges: Record<string, number> = {};
  for (const pet of [player, opponent]) {
    for (const move of pet.moves) charges[`${pet.id}:${move.id}`] = move.maxCharges;
  }

  return {
    id: cryptoSafeId(),
    turn: 1,
    activeSide: modifiedStat(player, "speed") >= modifiedStat(opponent, "speed") ? "player" : "opponent",
    player,
    opponent,
    charges,
    log: ["A challenger stepped into the arena."]
  };
}

export function ensureActiveSide(state: BattleState): BattleState {
  if (state.activeSide) return state;
  return {
    ...state,
    activeSide: modifiedStat(state.player, "speed") >= modifiedStat(state.opponent, "speed") ? "player" : "opponent"
  };
}

export function resolveActiveTurn(state: BattleState, action: BattleAction, seed: number, options: { xpMultiplier?: number } = {}): ResolvedTurn {
  const next = ensureActiveSide(cloneBattleState(state));
  const side = next.activeSide;
  const targetSide = otherSide(side);
  const actor = getPet(next, side);
  const target = getPet(next, targetSide);
  const rng = seededRandom(seed + next.turn * 997);
  const events: TurnEvent[] = [];

  applyStartOfTurnStatus(next, side, events);

  if (actor.currentHp <= 0) {
    next.winner = targetSide;
    events.push({ kind: "faint", target: side });
    events.push({ kind: "winner", winner: targetSide });
    return finalizeActiveTurn(next, events, side, targetSide);
  }

  if (target.currentHp <= 0) {
    next.winner = side;
    events.push({ kind: "winner", winner: side });
    return finalizeActiveTurn(next, events, side, targetSide);
  }

  if (actor.statuses.sleep && rng() < 0.5) {
    events.push({ kind: "message", text: `${actor.name} is sleeping through the turn.` });
  } else if (actor.statuses.stun) {
    events.push({ kind: "message", text: `${actor.name} is stunned and cannot move.` });
  } else {
    resolveAction(next, side, targetSide, action, rng, events);
  }

  if (!next.winner && getPet(next, targetSide).currentHp <= 0) {
    events.push({ kind: "faint", target: targetSide });
    next.winner = side;
    const progression = applyBattleProgressionWithMultiplier(actor, getPet(next, targetSide), options.xpMultiplier ?? 1);
    events.push({ kind: "xp", target: side, amount: progression.xpGained, xp: actor.xp, nextLevelXp: progression.nextLevelXp });
    events.push({ kind: "message", text: `${actor.name} gained ${progression.xpGained} XP.` });
    if (progression.leveledUp) {
      events.push({ kind: "level-up", target: side, oldLevel: progression.oldLevel, newLevel: progression.newLevel });
      events.push({ kind: "message", text: `${actor.name} grew to level ${progression.newLevel}.` });
    }
    events.push({ kind: "winner", winner: side });
  }

  return finalizeActiveTurn(next, events, side, targetSide);
}

export function resolveTurn(state: BattleState, input: TurnInput): ResolvedTurn {
  const rng = seededRandom(input.seed + state.turn * 997);
  const next = cloneBattleState(state);
  const events: TurnEvent[] = [];

  applyStartOfTurnStatus(next, "player", events);
  applyStartOfTurnStatus(next, "opponent", events);

  if (next.player.currentHp <= 0 || next.opponent.currentHp <= 0) {
    return finalizeTurn(next, events);
  }

  const order = getActionOrder(next, input.player, input.opponent);
  for (const side of order) {
    if (next.winner) break;
    const actor = getPet(next, side);
    const targetSide = otherSide(side);
    const action = side === "player" ? input.player : input.opponent;

    if (actor.currentHp <= 0) continue;
    if (actor.statuses.sleep && rng() < 0.5) {
      events.push({ kind: "message", text: `${actor.name} is sleeping through the turn.` });
      continue;
    }
    if (actor.statuses.stun) {
      events.push({ kind: "message", text: `${actor.name} is stunned and cannot move.` });
      continue;
    }

    resolveAction(next, side, targetSide, action, rng, events);
    if (getPet(next, targetSide).currentHp <= 0) {
      events.push({ kind: "faint", target: targetSide });
      next.winner = side;
      const progression = applyBattleProgressionWithMultiplier(actor, getPet(next, targetSide), 1);
      events.push({ kind: "xp", target: side, amount: progression.xpGained, xp: actor.xp, nextLevelXp: progression.nextLevelXp });
      events.push({ kind: "message", text: `${actor.name} gained ${progression.xpGained} XP.` });
      if (progression.leveledUp) {
        events.push({ kind: "level-up", target: side, oldLevel: progression.oldLevel, newLevel: progression.newLevel });
        events.push({ kind: "message", text: `${actor.name} grew to level ${progression.newLevel}.` });
      }
      events.push({ kind: "winner", winner: side });
    }
  }

  return finalizeTurn(next, events);
}

function resolveAction(
  state: BattleState,
  side: BattleSide,
  targetSide: BattleSide,
  action: BattleAction,
  rng: () => number,
  events: TurnEvent[]
) {
  const actor = getPet(state, side);
  const target = getPet(state, targetSide);

  if (action.type === "yield") {
    state.winner = targetSide;
    events.push({ kind: "message", text: `${actor.name} yielded the match.` });
    events.push({ kind: "winner", winner: targetSide });
    return;
  }

  if (action.type === "focus") {
    actor.statuses.focus = 2;
    actor.stages.special = clampStage(actor.stages.special + 1);
    events.push({ kind: "message", text: `${actor.name} tightened its focus. Its next attacks will hit harder.` });
    events.push({ kind: "stage", target: side, stat: "special", stages: actor.stages.special });
    return;
  }

  if (action.type === "guard") {
    actor.statuses.shield = 1;
    events.push({ kind: "message", text: `${actor.name} raised a shield to soften this turn's hit.` });
    events.push({ kind: "status", target: side, status: "shield", duration: 1 });
    return;
  }

  const move = actor.moves.find((candidate) => candidate.id === action.moveId);
  if (!move) {
    events.push({ kind: "message", text: `${actor.name} hesitated.` });
    return;
  }

  const chargeKey = `${actor.id}:${move.id}`;
  if ((state.charges[chargeKey] ?? 0) <= 0) {
    events.push({ kind: "message", text: `${move.name} has no charges left.` });
    return;
  }

  state.charges[chargeKey] -= 1;
  events.push({ kind: "message", text: `${actor.name} used ${move.name}.` });

  const effectiveAccuracy = target.statuses.shield ? Math.max(35, Math.floor(move.accuracy * 0.72)) : move.accuracy;
  if (rng() * 100 > effectiveAccuracy) {
    events.push({ kind: "message", text: target.statuses.shield ? `${move.name} glanced off the guard and missed.` : `${move.name} missed.` });
    return;
  }

  if (move.category === "status") {
    applyMoveEffect(state, side, targetSide, move, rng, events);
    return;
  }

  const damage = calculateDamage(actor, target, move, rng);
  target.currentHp = Math.max(0, target.currentHp - damage);
  events.push({ kind: "damage", target: targetSide, amount: damage, hp: target.currentHp });
  events.push({
    kind: "message",
    text: `${target.name} lost ${damage} HP${target.statuses.shield ? " through guard" : ""}.`
  });
  applyMoveEffect(state, side, targetSide, move, rng, events);
}

export function calculateDamage(attacker: BattlePet, defender: BattlePet, move: BattleMove, rngSeedOrFn: number | (() => number)): number {
  const rng = typeof rngSeedOrFn === "number" ? seededRandom(rngSeedOrFn) : rngSeedOrFn;
  const attackStat = move.category === "physical" ? "attack" : "special";
  const defenseStat = move.category === "physical" ? "defense" : "special";
  const attack = modifiedStat(attacker, attackStat);
  const defense = Math.max(1, modifiedStat(defender, defenseStat));
  const ratio = Math.max(0.6, Math.min(1.55, attack / defense));
  const base = move.power * 0.26 * ratio + attacker.level * 0.6 + 1.2;
  const affinity = AFFINITY_CHART[move.affinity][defender.affinity] ?? 1;
  const sameAffinity = move.affinity === attacker.affinity ? 1.12 : 1;
  const crit = rng() < criticalChance(attacker) ? 1.6 : 1;
  const random = 0.85 + rng() * 0.15;
  const burn = attacker.statuses.burn && move.category === "physical" ? 0.65 : 1;
  const shield = defender.statuses.shield ? 0.55 : 1;
  const focus = attacker.statuses.focus ? 1.18 : 1;

  return Math.max(1, Math.floor(base * affinity * sameAffinity * crit * random * burn * shield * focus));
}

function applyMoveEffect(
  state: BattleState,
  side: BattleSide,
  targetSide: BattleSide,
  move: BattleMove,
  rng: () => number,
  events: TurnEvent[]
) {
  if (!move.effect) return;
  const actor = getPet(state, side);
  const target = getPet(state, targetSide);

  if (move.effect.kind === "status" && rng() <= move.effect.chance && !target.statuses[move.effect.status]) {
    target.statuses[move.effect.status] = move.effect.duration;
    events.push({ kind: "status", target: targetSide, status: move.effect.status, duration: move.effect.duration });
  }

  if (move.effect.kind === "stage") {
    const pet = move.effect.target === "self" ? actor : target;
    const eventTarget = move.effect.target === "self" ? side : targetSide;
    pet.stages[move.effect.stat] = clampStage(pet.stages[move.effect.stat] + move.effect.stages);
    events.push({ kind: "stage", target: eventTarget, stat: move.effect.stat, stages: pet.stages[move.effect.stat] });
  }

  if (move.effect.kind === "heal") {
    const amount = Math.ceil(actor.stats.hp * move.effect.percent);
    actor.currentHp = Math.min(actor.stats.hp, actor.currentHp + amount);
    events.push({ kind: "heal", target: side, amount, hp: actor.currentHp });
  }
}

function applyStartOfTurnStatus(state: BattleState, side: BattleSide, events: TurnEvent[]) {
  const pet = getPet(state, side);
  if (pet.statuses.poison) {
    const damage = Math.max(1, Math.floor(pet.stats.hp / 12));
    pet.currentHp = Math.max(0, pet.currentHp - damage);
    events.push({ kind: "message", text: `${pet.name} took poison damage.` });
    events.push({ kind: "damage", target: side, amount: damage, hp: pet.currentHp });
  }
  if (pet.statuses.burn) {
    const damage = Math.max(1, Math.floor(pet.stats.hp / 16));
    pet.currentHp = Math.max(0, pet.currentHp - damage);
    events.push({ kind: "message", text: `${pet.name} is hurt by burn.` });
    events.push({ kind: "damage", target: side, amount: damage, hp: pet.currentHp });
  }
}

function finalizeTurn(state: BattleState, events: TurnEvent[]): ResolvedTurn {
  for (const pet of [state.player, state.opponent]) {
    for (const status of Object.keys(pet.statuses)) {
      const key = status as keyof typeof pet.statuses;
      const remaining = (pet.statuses[key] ?? 0) - 1;
      if (remaining <= 0) delete pet.statuses[key];
      else pet.statuses[key] = remaining;
    }
  }

  state.turn += 1;
  state.log = [...state.log, ...events.filter((event) => event.kind === "message").map((event) => event.text)].slice(-10);
  return { state, events };
}

function finalizeActiveTurn(state: BattleState, events: TurnEvent[], actorSide: BattleSide, targetSide: BattleSide): ResolvedTurn {
  expireStatusesAfterAction(getPet(state, actorSide), ["shield"]);
  expireStatusesAfterAction(getPet(state, targetSide), ["focus"]);

  if (!state.winner) state.activeSide = targetSide;
  state.turn += 1;
  state.log = [...state.log, ...events.filter((event) => event.kind === "message").map((event) => event.text)].slice(-10);
  return { state, events };
}

function expireStatusesAfterAction(pet: BattlePet, keep: BattleStatus[]) {
  for (const status of Object.keys(pet.statuses)) {
    const key = status as BattleStatus;
    if (keep.includes(key)) continue;
    const remaining = (pet.statuses[key] ?? 0) - 1;
    if (remaining <= 0) delete pet.statuses[key];
    else pet.statuses[key] = remaining;
  }
}

function getActionOrder(state: BattleState, player: BattleAction, opponent: BattleAction): BattleSide[] {
  const playerPriority = actionPriority(state.player, player);
  const opponentPriority = actionPriority(state.opponent, opponent);
  if (playerPriority !== opponentPriority) return playerPriority > opponentPriority ? ["player", "opponent"] : ["opponent", "player"];
  return modifiedStat(state.player, "speed") >= modifiedStat(state.opponent, "speed") ? ["player", "opponent"] : ["opponent", "player"];
}

function actionPriority(pet: BattlePet, action: BattleAction): number {
  if (action.type === "guard") return 2;
  if (action.type !== "move") return 0;
  return pet.moves.find((move) => move.id === action.moveId)?.priority ?? 0;
}

function modifiedStat(pet: BattlePet, stat: StatKey): number {
  return Math.floor(pet.stats[stat] * STAGE_MULTIPLIERS[pet.stages[stat]]);
}

function criticalChance(pet: BattlePet): number {
  return Math.min(0.22, 0.06 + pet.stats.speed / 1200);
}

function clampStage(stage: number): number {
  return Math.max(-6, Math.min(6, stage));
}

function statsForPet(name: string, level: number): PetStats {
  const roll = seededRandom(hashString(name));
  return {
    hp: 38 + level * 4 + Math.floor(roll() * 9),
    attack: 14 + level * 2 + Math.floor(roll() * 7),
    defense: 14 + level * 2 + Math.floor(roll() * 7),
    special: 14 + level * 2 + Math.floor(roll() * 7),
    speed: 12 + level * 2 + Math.floor(roll() * 8)
  };
}

function pickAffinity(name: string): Affinity {
  const affinities: Affinity[] = ["spark", "leaf", "ember", "aqua", "stone", "glitch"];
  return affinities[Math.abs(hashString(name)) % affinities.length];
}

function getPet(state: BattleState, side: BattleSide): BattlePet {
  return side === "player" ? state.player : state.opponent;
}

function otherSide(side: BattleSide): BattleSide {
  return side === "player" ? "opponent" : "player";
}

function cloneBattleState(state: BattleState): BattleState {
  return JSON.parse(JSON.stringify(state)) as BattleState;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}

function cryptoSafeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `battle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
