import type { Affinity, BattleMove, MoveCategory } from "./types";

const AFFINITIES: Affinity[] = ["spark", "leaf", "ember", "aqua", "stone", "glitch"];
const CATEGORIES: MoveCategory[] = ["physical", "special"];
const FALLBACK_MOVE_BANK: PersonalMoveRecord[] = [
  fallbackMove("Quick Pounce", "physical", "spark", 23, 96, 26),
  fallbackMove("Boot Feint", "physical", "stone", 21, 98, 28),
  fallbackMove("Shoulder Check", "physical", "stone", 27, 90, 22),
  fallbackMove("Pocket Jab", "physical", "glitch", 20, 100, 30),
  fallbackMove("Dash Tackle", "physical", "spark", 25, 92, 24),
  fallbackMove("Leafy Trip", "physical", "leaf", 22, 95, 26),
  fallbackMove("Ember Shove", "physical", "ember", 26, 90, 22),
  fallbackMove("Tide Sweep", "physical", "aqua", 24, 93, 24),
  fallbackMove("Stone Bump", "physical", "stone", 28, 88, 20),
  fallbackMove("Glitch Nudge", "physical", "glitch", 23, 94, 25),
  fallbackMove("Bright Flicker", "special", "spark", 27, 90, 18),
  fallbackMove("Soft Static", "special", "spark", 25, 94, 20),
  fallbackMove("Vine Wink", "special", "leaf", 26, 91, 18),
  fallbackMove("Petal Daze", "special", "leaf", 29, 86, 16),
  fallbackMove("Tiny Flare", "special", "ember", 30, 84, 16),
  fallbackMove("Hot Glare", "special", "ember", 28, 88, 18),
  fallbackMove("Bubble Riddle", "special", "aqua", 27, 90, 18),
  fallbackMove("Mirror Drop", "special", "aqua", 31, 82, 14),
  fallbackMove("Pebble Echo", "special", "stone", 29, 86, 16),
  fallbackMove("Pixel Hex", "special", "glitch", 32, 80, 14)
];

export type PersonalMoveInput = {
  name: string;
  description: string;
};

export type PersonalMoveRecord = {
  display_name: string;
  move_key: string;
  power: number;
  accuracy: number;
  category: MoveCategory;
  affinity: Affinity;
  max_charges: number;
  effect: null;
};

export function buildPersonalMovePrompt(input: PersonalMoveInput) {
  return `You are designing two signature battle moves for an original Codex Pet Arena fighter.

The game is a lightweight turn-based pet battle game. The moves should feel personal to this exact pet, like they were invented from the pet's look, outfit, personality, props, colors, job, mood, or backstory. Do not write generic fantasy attacks.

Pet:
- Name: ${input.name}
- Description: ${input.description || "No description provided."}

Return JSON only. No markdown, comments, prose, or trailing commas.

Required JSON shape:
{"moves":[{"name":"...","affinity":"spark|leaf|ember|aqua|stone|glitch","category":"physical|special","power":number,"accuracy":number,"max_charges":number}]}

Creative rules:
- Generate exactly 2 moves.
- Each move name must be 2-4 words and 24 characters or less.
- Use concrete details from the pet description. Prefer visual/action phrases over generic combat words.
- One move should feel like a close-range physical action. One move should feel like a ranged, weird, emotional, tech, elemental, or stylish special action.
- Names should sound playful and game-like, but not silly filler.
- Avoid these generic words unless they are strongly justified by the description: Strike, Burst, Blast, Beam, Punch, Kick, Slash, Wave.
- Do not use Pokemon move names, Pokemon type names, copyrighted character names, brand names, celebrity names, or real-person attack names.
- Do not include the words Codex, pet, arena, attack, move, power, wife, husband, inspired, chibi.

Balance rules:
- Generate one physical move and one special move.
- Physical move: category "physical", power 18-30, accuracy 88-100, max_charges 18-30.
- Special move: category "special", power 22-34, accuracy 78-94, max_charges 12-22.
- Pick affinity by flavor, not by power:
  - spark: quick, bright, electric, clever, energetic, techy
  - leaf: graceful, natural, healing, growth, fabric, hair, charm
  - ember: bold, hot, dramatic, angry, stylish, spotlight
  - aqua: calm, flowing, reflective, clean, emotional, smooth
  - stone: sturdy, grounded, boots, armor, heavy, stubborn
  - glitch: weird, digital, mischievous, cursed, clever, surreal

Quality bar:
- A good move for a brunette character with teal eyes and black boots could be "Teal Glance" or "Bootstep Feint".
- A bad move is "Power Strike" because it could belong to anyone.
- A bad move is "Thunderbolt" because it is a protected monster-battle move name.`;
}

export function fallbackPersonalMoves(input: PersonalMoveInput): PersonalMoveRecord[] {
  const seed = hashString(`${input.name}:${input.description}`);
  const physicalMoves = FALLBACK_MOVE_BANK.filter((move) => move.category === "physical");
  const specialMoves = FALLBACK_MOVE_BANK.filter((move) => move.category === "special");
  const physical = physicalMoves[seed % physicalMoves.length];
  const special = specialMoves[Math.floor(seed / physicalMoves.length) % specialMoves.length];

  return [physical, special].map((move) => ({ ...move }));
}

export function normalizePersonalMoves(rawMoves: unknown, input: PersonalMoveInput): PersonalMoveRecord[] {
  if (!Array.isArray(rawMoves)) return fallbackPersonalMoves(input);

  const normalized = rawMoves.slice(0, 2).map((raw, index) => {
    const candidate = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const fallback = fallbackPersonalMoves(input)[index];
    const name = sanitizeMoveName(String(candidate.name ?? candidate.display_name ?? fallback.display_name));
    const category = CATEGORIES.includes(candidate.category as MoveCategory) ? (candidate.category as MoveCategory) : fallback.category;
    const affinity = AFFINITIES.includes(candidate.affinity as Affinity) ? (candidate.affinity as Affinity) : fallback.affinity;

    return {
      display_name: name,
      move_key: slugify(name),
      power: clampInteger(Number(candidate.power), 18, 34, fallback.power),
      accuracy: clampInteger(Number(candidate.accuracy), 78, 100, fallback.accuracy),
      category,
      affinity,
      max_charges: clampInteger(Number(candidate.max_charges ?? candidate.maxCharges), 12, 32, fallback.max_charges),
      effect: null
    };
  });

  while (normalized.length < 2) {
    normalized.push(fallbackPersonalMoves(input)[normalized.length]);
  }

  return normalized;
}

export function personalMoveRecordToBattleMove(move: PersonalMoveRecord): BattleMove {
  return {
    id: move.move_key,
    name: move.display_name,
    affinity: move.affinity,
    category: move.category,
    power: clampInteger(move.power, 18, 34, move.category === "physical" ? 24 : 28),
    accuracy: move.accuracy,
    maxCharges: move.max_charges
  };
}

function fallbackMove(
  displayName: string,
  category: MoveCategory,
  affinity: Affinity,
  power: number,
  accuracy: number,
  maxCharges: number
): PersonalMoveRecord {
  return {
    display_name: displayName,
    move_key: slugify(displayName),
    power,
    accuracy,
    category,
    affinity,
    max_charges: maxCharges,
    effect: null
  };
}

function sanitizeMoveName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 24) || "Signature Strike";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) + 1;
}
