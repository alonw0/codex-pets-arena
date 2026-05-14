import { describe, expect, it } from "vitest";
import { createBattlePet, createInitialBattle, resolveActiveTurn } from "@/lib/battle/engine";
import { chooseNpcAction, NPC_XP_MULTIPLIER, npcMasterToBattlePet, NPC_MASTERS } from "@/lib/battle/masters";
import { xpForDefeat } from "@/lib/battle/progression";

describe("NPC masters", () => {
  it("chooses valid non-yield actions and respects charges", () => {
    const player = createBattlePet({ id: "player", ownerId: "user", name: "Runner", level: 1 });
    const npc = npcMasterToBattlePet(NPC_MASTERS[0]);
    const state = createInitialBattle(player, npc);
    state.activeSide = "opponent";

    const action = chooseNpcAction(state, 42);

    expect(action.type).not.toBe("yield");
    if (action.type === "move") {
      expect(npc.moves.some((move) => move.id === action.moveId)).toBe(true);
      expect(state.charges[`${npc.id}:${action.moveId}`]).toBeGreaterThan(0);
    }
  });

  it("guards when no move has charges", () => {
    const player = createBattlePet({ id: "player", ownerId: "user", name: "Runner", level: 1 });
    const npc = npcMasterToBattlePet(NPC_MASTERS[0]);
    const state = createInitialBattle(player, npc);
    for (const move of npc.moves) state.charges[`${npc.id}:${move.id}`] = 0;

    expect(chooseNpcAction(state, 12)).toEqual({ type: "guard" });
  });

  it("grants reduced training XP for player wins", () => {
    const player = createBattlePet({ id: "player", ownerId: "user", name: "Runner", level: 1 });
    const npc = npcMasterToBattlePet(NPC_MASTERS[0]);
    const state = createInitialBattle(player, npc);
    state.activeSide = "player";
    state.opponent.currentHp = 1;
    const expectedXp = Math.floor(xpForDefeat(player, npc) * NPC_XP_MULTIPLIER);

    const resolved = resolveActiveTurn(state, { type: "move", moveId: player.moves[0].id }, 4, { xpMultiplier: NPC_XP_MULTIPLIER });
    const xpEvent = resolved.events.find((event) => event.kind === "xp");

    expect(resolved.state.winner).toBe("player");
    expect(xpEvent?.kind === "xp" ? xpEvent.amount : 0).toBe(expectedXp);
    expect(resolved.events.some((event) => event.kind === "badge")).toBe(false);
  });
});
