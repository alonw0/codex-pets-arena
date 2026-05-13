export type Affinity =
  | "spark"
  | "leaf"
  | "ember"
  | "aqua"
  | "stone"
  | "glitch";

export type MoveCategory = "physical" | "special" | "status";
export type BattleStatus = "burn" | "poison" | "stun" | "sleep" | "shield" | "focus";
export type StatKey = "attack" | "defense" | "special" | "speed";

export type PetStats = {
  hp: number;
  attack: number;
  defense: number;
  special: number;
  speed: number;
};

export type BattleMove = {
  id: string;
  name: string;
  affinity: Affinity;
  category: MoveCategory;
  power: number;
  accuracy: number;
  maxCharges: number;
  priority?: number;
  effect?: MoveEffect;
};

export type MoveEffect =
  | { kind: "status"; status: BattleStatus; chance: number; duration: number }
  | { kind: "stage"; stat: StatKey; stages: number; target: "self" | "opponent" }
  | { kind: "heal"; percent: number };

export type BattlePet = {
  id: string;
  ownerId: string;
  name: string;
  level: number;
  xp: number;
  affinity: Affinity;
  stats: PetStats;
  currentHp: number;
  stages: Record<StatKey, number>;
  statuses: Partial<Record<BattleStatus, number>>;
  moves: BattleMove[];
  spriteUrl?: string;
};

export type BattleAction =
  | { type: "move"; moveId: string }
  | { type: "focus" }
  | { type: "guard" }
  | { type: "yield" };

export type BattleSide = "player" | "opponent";

export type BattleState = {
  id: string;
  turn: number;
  activeSide: BattleSide;
  player: BattlePet;
  opponent: BattlePet;
  charges: Record<string, number>;
  winner?: BattleSide;
  log: string[];
};

export type TurnInput = {
  player: BattleAction;
  opponent: BattleAction;
  seed: number;
};

export type TurnEvent =
  | { kind: "message"; text: string }
  | { kind: "damage"; target: BattleSide; amount: number; hp: number }
  | { kind: "heal"; target: BattleSide; amount: number; hp: number }
  | { kind: "status"; target: BattleSide; status: BattleStatus; duration: number }
  | { kind: "stage"; target: BattleSide; stat: StatKey; stages: number }
  | { kind: "faint"; target: BattleSide }
  | { kind: "xp"; target: BattleSide; amount: number; xp: number; nextLevelXp: number }
  | { kind: "level-up"; target: BattleSide; oldLevel: number; newLevel: number }
  | { kind: "winner"; winner: BattleSide };

export type ResolvedTurn = {
  state: BattleState;
  events: TurnEvent[];
};
