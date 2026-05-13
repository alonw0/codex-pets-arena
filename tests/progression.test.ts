import { describe, expect, it } from "vitest";
import { createBattlePet } from "@/lib/battle/engine";
import { applyBattleProgression, xpForDefeat, xpForNextLevel } from "@/lib/battle/progression";

describe("battle progression", () => {
  it("calculates higher rewards for stronger defeated pets", () => {
    const winner = createBattlePet({ id: "p1", ownerId: "u1", name: "RanSec", level: 5 });
    const lowLevel = createBattlePet({ id: "p2", ownerId: "u2", name: "Tiny", level: 3 });
    const highLevel = createBattlePet({ id: "p3", ownerId: "u3", name: "Boss", level: 8 });

    expect(xpForDefeat(winner, highLevel)).toBeGreaterThan(xpForDefeat(winner, lowLevel));
  });

  it("levels up and grows stats when enough XP is earned", () => {
    const winner = createBattlePet({ id: "p1", ownerId: "u1", name: "RanSec", level: 5 });
    const defeated = createBattlePet({ id: "p2", ownerId: "u2", name: "Boss", level: 20 });
    winner.xp = xpForNextLevel(winner.level) - 20;
    const oldStats = { ...winner.stats };

    const result = applyBattleProgression(winner, defeated);

    expect(result.leveledUp).toBe(true);
    expect(winner.level).toBeGreaterThan(5);
    expect(winner.stats.hp).toBeGreaterThan(oldStats.hp);
    expect(winner.stats.attack).toBeGreaterThan(oldStats.attack);
  });
});
