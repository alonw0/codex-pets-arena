import { describe, expect, it } from "vitest";
import { fallbackPersonalMoves, normalizePersonalMoves } from "@/lib/battle/personalMoves";

describe("personal moves", () => {
  it("creates two deterministic fallback moves", () => {
    const first = fallbackPersonalMoves({ name: "Sable", description: "A brunette chibi pet with teal eyes and black boots." });
    const second = fallbackPersonalMoves({ name: "Sable", description: "A brunette chibi pet with teal eyes and black boots." });

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0].display_name).toBeTruthy();
  });

  it("normalizes unsafe generated move fields", () => {
    const moves = normalizePersonalMoves(
      [
        { name: "Very Very Very Very Long !!! Move", affinity: "unknown", category: "magic", power: 999, accuracy: 4, max_charges: 99 },
        { name: "Boot Dash", affinity: "stone", category: "physical", power: 50, accuracy: 90, max_charges: 20 }
      ],
      { name: "Sable", description: "Black boots." }
    );

    expect(moves).toHaveLength(2);
    expect(moves[0].display_name.length).toBeLessThanOrEqual(24);
    expect(moves[0].power).toBe(34);
    expect(moves[0].accuracy).toBe(78);
    expect(moves[0].max_charges).toBe(32);
    expect(moves[1].display_name).toBe("Boot Dash");
  });
});
