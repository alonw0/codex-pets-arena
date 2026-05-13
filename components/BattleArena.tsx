"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, LoaderCircle, Shield, Swords, Zap } from "lucide-react";
import { ensureActiveSide, resolveActiveTurn } from "@/lib/battle/engine";
import { xpForNextLevel } from "@/lib/battle/progression";
import type { BattleAction, BattleMove, BattleSide, BattleState, TurnEvent } from "@/lib/battle/types";
import { createDemoBattle } from "@/lib/demo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PetSprite } from "./PetSprite";

type BattleArenaProps = {
  battleId?: string;
  initialState?: BattleState;
};

export function BattleArena({ battleId, initialState }: BattleArenaProps) {
  const router = useRouter();
  const [state, setState] = useState<BattleState | null>(() => (battleId ? initialState ? ensureActiveSide(initialState) : null : ensureActiveSide(initialState ?? createDemoBattle())));
  const [events, setEvents] = useState<TurnEvent[]>([]);
  const [mySide, setMySide] = useState<BattleSide>("player");
  const [status, setStatus] = useState(battleId ? "Loading battle..." : "");
  const [battleStatus, setBattleStatus] = useState<"active" | "complete" | "abandoned">("active");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [isLoadingBattle, setIsLoadingBattle] = useState(Boolean(battleId && !initialState));
  const [timer, setTimer] = useState(29);

  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    loadBattle(true);

    async function loadBattle(preloadSprites = false) {
      try {
        if (preloadSprites) setIsLoadingBattle(true);
        const token = await getAccessToken();
        const response = await fetch(`/api/battles/${battleId}`, { headers: { authorization: `Bearer ${token}` } });
        const payload = (await response.json()) as { battle?: { state: BattleState; status?: "active" | "complete" | "abandoned" }; events?: Array<{ event: TurnEvent }>; side?: BattleSide; error?: string };
        if (!response.ok || !payload.battle) throw new Error(payload.error ?? "Could not load battle.");
        const loadedState = ensureActiveSide(payload.battle.state);
        if (preloadSprites) await preloadBattleSprites(loadedState);
        if (cancelled) return;
        setState(loadedState);
        setBattleStatus(payload.battle.status ?? "active");
        setEvents((payload.events ?? []).map((eventRow) => eventRow.event).slice(-12));
        setMySide(payload.side ?? "player");
        setStatus("");
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Could not load battle.");
      } finally {
        if (!cancelled) setIsLoadingBattle(false);
      }
    }

    const channel = supabase
      ?.channel(`battle:${battleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "battles", filter: `id=eq.${battleId}` },
        (payload) => {
          const updated = payload.new as { state?: BattleState; status?: "active" | "complete" | "abandoned" };
          if (updated.state) {
            setState(ensureActiveSide(updated.state));
            setBattleStatus(updated.status ?? "active");
            setStatus("");
            setIsLoadingBattle(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "battle_events", filter: `battle_id=eq.${battleId}` },
        (payload) => {
          const eventRow = payload.new as { event?: TurnEvent };
          if (eventRow.event) setEvents((current) => [...current, eventRow.event!].slice(-12));
        }
      )
      .subscribe();

    const poll = window.setInterval(() => loadBattle(false), 6000);
    const refreshOnFocus = () => loadBattle(false);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshOnFocus);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [battleId]);

  if (!state || isLoadingBattle) {
    return <BattleLoading status={status} />;
  }

  async function choose(action: BattleAction) {
    if (!state || state.winner || battleStatus !== "active") return;
    const visibleState = mySide === "opponent" ? swapBattleState(state) : state;
    const isMyTurn = visibleState.activeSide === "player";
    if (battleId) {
      if (!isMyTurn) {
        setStatus("Waiting for opponent.");
        return;
      }
      try {
        setStatus("Resolving turn...");
        const token = await getAccessToken();
        const response = await fetch(`/api/battles/${battleId}/turn`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ action })
        });
        const payload = (await response.json()) as { status?: string; state?: BattleState; events?: TurnEvent[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not submit turn.");
        if (payload.state) setState(ensureActiveSide(payload.state));
        if (payload.events) setEvents(payload.events);
        const nextState = payload.state ? (mySide === "opponent" ? swapBattleState(ensureActiveSide(payload.state)) : ensureActiveSide(payload.state)) : null;
        setStatus(nextState?.winner ? "" : nextState?.activeSide === "player" ? "Your turn." : "Waiting for opponent.");
        setTimer(29);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not submit turn.");
      }
      return;
    }

    const resolved = resolveActiveTurn(state, action, Date.now() % 100000);
    setState(resolved.state);
    setEvents(resolved.events);
    setTimer(29);
  }

  async function leaveFight() {
    if (!battleId || leaveBusy) return;
    setLeaveBusy(true);
    setStatus("Leaving fight...");
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/battles/${battleId}/leave`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not leave fight.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not leave fight.");
      setLeaveBusy(false);
    }
  }

  const latestAttack = [...events].reverse().find((event) => event.kind === "damage");
  const displayState = mySide === "opponent" ? swapBattleState(state) : state;
  const displayLatestAttack = mySide === "opponent" && latestAttack?.kind === "damage" ? { ...latestAttack, target: swapSide(latestAttack.target) } : latestAttack;
  const playerAnimation = animationFor("player", displayState.winner, displayLatestAttack);
  const opponentAnimation = animationFor("opponent", displayState.winner, displayLatestAttack);
  const visibleLog = displayState.log.slice(-3);
  const quickMoves = displayState.player.moves.filter((move) => move.category !== "status").slice(0, 2);
  const isClosed = battleStatus !== "active";
  const isPlayerTurn = !isClosed && !displayState.winner && displayState.activeSide === "player";
  const isResolving = status === "Resolving turn..." || status === "Leaving fight...";
  const renderedLogLines = displayState.winner ? [] : visibleLog;
  const turnCopy = getTurnCopy({
    battleId,
    displayState,
    isClosed,
    isPlayerTurn,
    isResolving,
    status
  });
  const primaryLogLine = renderedLogLines.length && !displayState.winner && !isClosed && !isResolving
    ? renderedLogLines[renderedLogLines.length - 1]
    : turnCopy.logLine;
  const recentLogLines = renderedLogLines.length && primaryLogLine === renderedLogLines[renderedLogLines.length - 1]
    ? renderedLogLines.slice(0, -1).slice(-2)
    : renderedLogLines.slice(-2);
  const commandsLocked = Boolean(isClosed || battleId && (!isPlayerTurn || isResolving));

  return (
    <section className="battle-shell">
      <div className="battle-stage" aria-label="Codex pet battle arena">
        <StatusPanel side="opponent" pet={displayState.opponent} />
        <div className={isPlayerTurn ? "turn-banner turn-banner-ready" : "turn-banner turn-banner-waiting"}>
          <strong>{turnCopy.title}</strong>
          <span>{turnCopy.detail}</span>
        </div>
        <div className="opponent-sprite">
          <PetSprite animation={opponentAnimation} facing="left" name={displayState.opponent.name} scale={0.88} src={displayState.opponent.spriteUrl} />
        </div>
        <div className="player-sprite">
          <PetSprite animation={playerAnimation} name={displayState.player.name} scale={1.05} src={displayState.player.spriteUrl} />
        </div>
        <StatusPanel side="player" pet={displayState.player} />
      </div>
      <div className="battle-console">
        <div className="battle-log">
          <div className={`battle-log-status battle-log-status-${turnCopy.tone}`}>
            <strong>{turnCopy.title}</strong>
            <span>{turnCopy.detail}</span>
          </div>
          <div className="battle-log-lines">
            <p className="battle-log-primary">{renderBattleText(primaryLogLine, displayState)}</p>
            {recentLogLines.map((line, index) => (
              <p className="battle-log-recent" key={`${line}-${index}`}>{renderBattleText(line, displayState)}</p>
            ))}
          </div>
          <span className="battle-log-meta">Turn {displayState.turn} / {timer}s</span>
        </div>
        <div className="command-grid">
          <div className={commandsLocked ? "command-state command-state-locked" : "command-state command-state-ready"}>
            <strong>{commandsLocked ? "Actions locked" : "Choose action"}</strong>
            <span>{commandsLocked ? turnCopy.detail : `${displayState.player.name} is ready.`}</span>
          </div>
          {displayState.winner ? (
            <button className="dashboard-return-button" onClick={() => router.push("/dashboard")} type="button">
              <Flag size={18} />
              <span>
                <strong>Back to dashboard</strong>
                <small>Return to roster</small>
              </span>
            </button>
          ) : null}
          {quickMoves.map((move, index) => (
            <MoveButton
              icon={index === 0 ? <Swords size={18} /> : <Zap size={18} />}
              key={move.id}
              move={move}
              petId={displayState.player.id}
              charges={displayState.charges}
              disabled={commandsLocked}
              onChoose={() => choose({ type: "move", moveId: move.id })}
            />
          ))}
          <button disabled={commandsLocked} onClick={() => choose({ type: "guard" })} type="button">
            <Shield size={18} />
            <span>
              <strong>Guard</strong>
              <small>Harder to hit</small>
            </span>
          </button>
          <button disabled={commandsLocked} onClick={() => choose({ type: "yield" })} type="button">
            <Flag size={18} />
            <span>
              <strong>Yield</strong>
              <small>Forfeit</small>
            </span>
          </button>
          {battleId ? (
            <button className="leave-fight-button" disabled={leaveBusy} onClick={leaveFight} type="button">
              <Flag size={18} />
              <span>
                <strong>{leaveBusy ? "Leaving..." : "Leave fight"}</strong>
                <small>Close this match</small>
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function getTurnCopy({
  battleId,
  displayState,
  isClosed,
  isPlayerTurn,
  isResolving,
  status
}: {
  battleId?: string;
  displayState: BattleState;
  isClosed: boolean;
  isPlayerTurn: boolean;
  isResolving: boolean;
  status: string;
}) {
  if (displayState.winner) {
    const winnerName = getPetName(displayState, displayState.winner);
    return {
      title: "Match complete",
      detail: `${winnerName} won.`,
      logLine: `${winnerName} wins the match.`,
      tone: "complete" as const
    };
  }

  if (isClosed) {
    return {
      title: "Fight closed",
      detail: "This battle is no longer active.",
      logLine: "This fight is closed.",
      tone: "closed" as const
    };
  }

  if (isResolving) {
    return {
      title: "Resolving",
      detail: "The arena is applying the last action.",
      logLine: status,
      tone: "resolving" as const
    };
  }

  if (!battleId) {
    return {
      title: "Demo turn",
      detail: `Choose an action for ${displayState.player.name}.`,
      logLine: `${displayState.player.name} is ready.`,
      tone: "ready" as const
    };
  }

  if (isPlayerTurn) {
    return {
      title: "Your turn",
      detail: `Choose an action for ${displayState.player.name}.`,
      logLine: `Your turn: choose an action for ${displayState.player.name}.`,
      tone: "ready" as const
    };
  }

  return {
    title: `${displayState.opponent.name}'s turn`,
    detail: "Waiting for the opponent to choose.",
    logLine: `${displayState.opponent.name}'s turn. Waiting for opponent.`,
    tone: "waiting" as const
  };
}

function renderBattleText(text: string, displayState: BattleState) {
  const names = [
    { name: displayState.player.name, className: "battle-name-player" },
    { name: displayState.opponent.name, className: "battle-name-opponent" }
  ].filter((entry) => entry.name).sort((a, b) => b.name.length - a.name.length);

  if (!names.length) return text;

  const pattern = new RegExp(`(${names.map((entry) => escapeRegex(entry.name)).join("|")})`, "g");
  return text.split(pattern).map((part, index) => {
    const match = names.find((entry) => entry.name === part);
    if (!match) return part;
    return <span className={`battle-name ${match.className}`} key={`${part}-${index}`}>{part}</span>;
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function BattleLoading({ status }: { status: string }) {
  return (
    <section className="battle-shell battle-loading-shell" aria-busy="true">
      <div className="battle-stage battle-loading-stage" aria-label="Loading Codex pet battle">
        <div className="status-panel status-opponent battle-status-skeleton">
          <span />
          <span />
          <span />
        </div>
        <div className="sprite-summon sprite-summon-opponent" />
        <div className="sprite-summon sprite-summon-player" />
        <div className="status-panel status-player battle-status-skeleton">
          <span />
          <span />
          <span />
        </div>
        <div className="battle-loading-badge">
          <LoaderCircle className="spinner" size={28} />
          <strong>Summoning fighters</strong>
          <span>{status || "Loading battle..."}</span>
        </div>
      </div>
      <div className="battle-console">
        <div className="battle-log">
          <div className="battle-log-status battle-log-status-resolving">
            <strong>Loading</strong>
            <span>Preparing sprites and battle state</span>
          </div>
          <div className="battle-log-lines">
            <p className="battle-log-primary">Preparing the arena...</p>
            <p className="battle-log-recent">Loading pet spritesheets...</p>
          </div>
          <span className="battle-log-meta">Turn -- / --s</span>
        </div>
        <div className="command-grid command-grid-disabled" aria-hidden="true">
          <button disabled type="button">Move</button>
          <button disabled type="button">Move</button>
          <button disabled type="button">Guard</button>
          <button disabled type="button">Yield</button>
        </div>
      </div>
    </section>
  );
}

function StatusPanel({ pet, side }: { pet: BattleState["player"]; side: BattleSide }) {
  const hpPercent = Math.max(0, Math.round((pet.currentHp / pet.stats.hp) * 100));
  const nextXp = xpForNextLevel(pet.level);
  const xpPercent = Math.max(0, Math.min(100, Math.round((pet.xp / nextXp) * 100)));
  return (
    <div className={`status-panel status-${side}`}>
      <div className="status-topline">
        <strong>{pet.name}</strong>
        <span>Lv {pet.level}</span>
      </div>
      <div className="hp-track" aria-label={`${pet.name} HP`}>
        <div className="hp-fill" style={{ width: `${hpPercent}%` }} />
      </div>
      <div className="status-bottomline">
        <span>{pet.currentHp}/{pet.stats.hp}</span>
        <span>{Object.keys(pet.statuses)[0] ?? pet.affinity}</span>
      </div>
      <div className="xp-track" aria-label={`${pet.name} XP`}>
        <div className="xp-fill" style={{ width: `${xpPercent}%` }} />
      </div>
      <div className="xp-line">XP {pet.xp}/{nextXp}</div>
    </div>
  );
}

function MoveButton({
  charges,
  disabled,
  icon,
  move,
  onChoose,
  petId
}: {
  charges: Record<string, number>;
  disabled?: boolean;
  icon: React.ReactNode;
  move: BattleMove;
  onChoose: () => void;
  petId: string;
}) {
  return (
    <button disabled={disabled} onClick={onChoose} type="button">
      {icon}
      <span>
        <strong>{move.name}</strong>
        <small>
          {move.affinity} / {charges[`${petId}:${move.id}`] ?? move.maxCharges}/{move.maxCharges}
        </small>
      </span>
    </button>
  );
}

function animationFor(side: BattleSide, winner: BattleSide | undefined, latestAttack: TurnEvent | undefined) {
  if (winner === side) return "waving";
  if (winner && winner !== side) return "failed";
  if (latestAttack?.kind === "damage" && latestAttack.target === side) return "failed";
  if (latestAttack?.kind === "damage" && latestAttack.target !== side) return "jumping";
  return side === "player" ? "idle" : "waiting";
}

function getPetName(state: BattleState, side: BattleSide) {
  return side === "player" ? state.player.name : state.opponent.name;
}

function swapSide(side: BattleSide): BattleSide {
  return side === "player" ? "opponent" : "player";
}

function swapBattleState(state: BattleState): BattleState {
  return {
    ...state,
    player: state.opponent,
    opponent: state.player,
    activeSide: swapSide(state.activeSide),
    winner: state.winner ? swapSide(state.winner) : undefined
  };
}

async function getAccessToken() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Log in to play this battle.");
  return token;
}

async function preloadBattleSprites(state: BattleState) {
  const urls = [state.player.spriteUrl, state.opponent.spriteUrl].filter((url): url is string => Boolean(url));
  await Promise.all(urls.map((url) => preloadImage(url).catch(() => undefined)));
}

function preloadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(), 5000);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Could not load ${url}`));
    };
    image.src = url;
  });
}
