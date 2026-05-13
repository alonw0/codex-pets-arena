import { describe, expect, it } from "vitest";
import { calculateDamage, createBattlePet, createInitialBattle, resolveActiveTurn, resolveTurn } from "@/lib/battle/engine";

describe("battle engine", () => {
  it("resolves deterministic turns from a seed", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "aqua" });
    const state = createInitialBattle(player, opponent);

    const first = resolveTurn(state, {
      player: { type: "move", moveId: "quick-byte" },
      opponent: { type: "move", moveId: "stack-slam" },
      seed: 42
    });
    const second = resolveTurn(createInitialBattle(player, opponent), {
      player: { type: "move", moveId: "quick-byte" },
      opponent: { type: "move", moveId: "stack-slam" },
      seed: 42
    });

    expect(first.events).toEqual(second.events);
    expect(first.state.turn).toBe(2);
  });

  it("applies affinity multipliers to damage", () => {
    const attacker = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const weakTarget = createBattlePet({ id: "p2", ownerId: "u2", name: "Aqua", affinity: "aqua" });
    const resistantTarget = createBattlePet({ id: "p3", ownerId: "u3", name: "Stone", affinity: "stone" });
    const move = attacker.moves[0];

    const weakDamage = calculateDamage(attacker, weakTarget, move, 7);
    const resistedDamage = calculateDamage(attacker, resistantTarget, move, 7);

    expect(weakDamage).toBeGreaterThan(resistedDamage);
  });

  it("starts new pets at level 1 with compact HP", () => {
    const pet = createBattlePet({ id: "p1", ownerId: "u1", name: "RanSec" });

    expect(pet.level).toBe(1);
    expect(pet.stats.hp).toBeGreaterThanOrEqual(42);
    expect(pet.stats.hp).toBeLessThanOrEqual(50);
  });

  it("keeps basic move damage in a short-fight range", () => {
    const attacker = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const defender = createBattlePet({ id: "p2", ownerId: "u2", name: "Neutral", affinity: "leaf" });
    const quick = attacker.moves.find((move) => move.id === "quick-byte")!;
    const heavy = attacker.moves.find((move) => move.id === "stack-slam")!;

    expect(calculateDamage(attacker, defender, quick, 4)).toBeGreaterThanOrEqual(5);
    expect(calculateDamage(attacker, defender, quick, 4)).toBeLessThanOrEqual(15);
    expect(calculateDamage(attacker, defender, heavy, 4)).toBeGreaterThanOrEqual(8);
    expect(calculateDamage(attacker, defender, heavy, 4)).toBeLessThanOrEqual(15);
  });

  it("lets guard reduce incoming damage", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "glitch" });
    const state = createInitialBattle(player, opponent);

    const resolved = resolveTurn(state, {
      player: { type: "guard" },
      opponent: { type: "move", moveId: "stack-slam" },
      seed: 99
    });

    expect(resolved.events.some((event) => event.kind === "status" && event.status === "shield")).toBe(true);
    expect(resolved.state.player.currentHp).toBeGreaterThan(player.stats.hp - 40);
    expect(resolved.state.log.at(-1)).toContain("through guard");
  });

  it("lets guard make incoming moves harder to hit", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "glitch" });
    const state = createInitialBattle(player, opponent);

    const resolved = resolveTurn(state, {
      player: { type: "guard" },
      opponent: { type: "move", moveId: "stack-slam" },
      seed: 80778
    });

    expect(resolved.state.player.currentHp).toBe(player.stats.hp);
    expect(resolved.state.log.at(-1)).toContain("glanced off the guard");
  });

  it("focus does not deal damage by itself", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "glitch" });
    const state = createInitialBattle(player, opponent);

    const resolved = resolveTurn(state, {
      player: { type: "focus" },
      opponent: { type: "guard" },
      seed: 21
    });

    expect(resolved.state.opponent.currentHp).toBe(opponent.stats.hp);
    expect(resolved.state.player.currentHp).toBe(player.stats.hp);
    expect(resolved.state.player.statuses.focus).toBe(1);
  });

  it("awards XP when a pet wins", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "aqua" });
    opponent.currentHp = 1;
    const state = createInitialBattle(player, opponent);

    const resolved = resolveTurn(state, {
      player: { type: "move", moveId: "quick-byte" },
      opponent: { type: "guard" },
      seed: 42
    });

    expect(resolved.state.winner).toBe("player");
    expect(resolved.state.player.xp).toBeGreaterThan(0);
    expect(resolved.events.some((event) => event.kind === "xp")).toBe(true);
  });

  it("resolves one active side at a time", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "aqua" });
    const state = createInitialBattle(player, opponent);
    state.activeSide = "player";

    const resolved = resolveActiveTurn(state, { type: "move", moveId: "quick-byte" }, 42);

    expect(resolved.state.activeSide).toBe("opponent");
    expect(resolved.state.turn).toBe(2);
    expect(resolved.state.opponent.currentHp).toBeLessThan(opponent.stats.hp);
    expect(resolved.state.player.currentHp).toBe(player.stats.hp);
  });

  it("usually finishes a basic fight in about 6-7 moves", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "aqua" });
    let state = createInitialBattle(player, opponent);
    state.activeSide = "player";

    let moves = 0;
    while (!state.winner && moves < 12) {
      const activePet = state.activeSide === "player" ? state.player : state.opponent;
      const move = activePet.moves.find((candidate) => candidate.id === "stack-slam") ?? activePet.moves[0];
      state = resolveActiveTurn(state, { type: "move", moveId: move.id }, 400 + moves).state;
      moves += 1;
    }

    expect(state.winner).toBeTruthy();
    expect(moves).toBeGreaterThanOrEqual(5);
    expect(moves).toBeLessThanOrEqual(8);
  });

  it("keeps guard active until the opponent acts", () => {
    const player = createBattlePet({ id: "p1", ownerId: "u1", name: "Stacky", affinity: "spark" });
    const opponent = createBattlePet({ id: "p2", ownerId: "u2", name: "Null Signal", affinity: "glitch" });
    const state = createInitialBattle(player, opponent);
    state.activeSide = "player";

    const guarded = resolveActiveTurn(state, { type: "guard" }, 10);
    expect(guarded.state.player.statuses.shield).toBe(1);
    expect(guarded.state.activeSide).toBe("opponent");

    const attacked = resolveActiveTurn(guarded.state, { type: "move", moveId: "stack-slam" }, 99);
    expect(attacked.state.player.statuses.shield).toBeUndefined();
    expect(attacked.state.player.currentHp).toBeGreaterThan(player.stats.hp - 40);
  });
});
