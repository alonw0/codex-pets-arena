"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Flag, Link2, LoaderCircle, MessageCircle, RotateCcw, Send, Share2, Shield, Swords, Trophy, Zap } from "lucide-react";
import { ensureActiveSide, resolveActiveTurn } from "@/lib/battle/engine";
import { xpForNextLevel } from "@/lib/battle/progression";
import type { BattleAction, BattleMove, BattleSide, BattleState, TurnEvent } from "@/lib/battle/types";
import { createDemoBattle } from "@/lib/demo";
import { buildShareLink, getClientShareUrl, nativeShareOrCopy, type SharePayload, type SharePlatform } from "@/lib/share";
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
  const [battleMode, setBattleMode] = useState<"pvp" | "npc">("pvp");
  const [npcMasterKey, setNpcMasterKey] = useState<string | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [isLoadingBattle, setIsLoadingBattle] = useState(Boolean(battleId && !initialState));
  const [timer, setTimer] = useState(29);
  const [shareStatus, setShareStatus] = useState("");
  const [rematchStatus, setRematchStatus] = useState("");
  const [rematchCode, setRematchCode] = useState("");
  const [rematchBusy, setRematchBusy] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const npcAutoTurnKeyRef = useRef("");
  const battleStateId = state?.id;

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
        const payload = (await response.json()) as {
          battle?: { state: BattleState; status?: "active" | "complete" | "abandoned"; mode?: "pvp" | "npc"; npc_master_key?: string | null };
          events?: Array<{ event: TurnEvent }>;
          side?: BattleSide;
          mode?: "pvp" | "npc";
          npcMasterKey?: string | null;
          error?: string;
        };
        if (!response.ok || !payload.battle) throw new Error(payload.error ?? "Could not load battle.");
        const loadedState = ensureActiveSide(payload.battle.state);
        if (preloadSprites) await preloadBattleSprites(loadedState);
        if (cancelled) return;
        setState(loadedState);
        setBattleStatus(payload.battle.status ?? "active");
        setBattleMode(payload.mode ?? payload.battle.mode ?? "pvp");
        setNpcMasterKey(payload.npcMasterKey ?? payload.battle.npc_master_key ?? null);
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

  useEffect(() => {
    if (!battleStateId) return;
    setShowIntro(true);
    const timeout = window.setTimeout(() => setShowIntro(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [battleStateId]);

  useEffect(() => {
    if (!battleId || battleMode !== "npc" || battleStatus !== "active" || !state || state.winner) return;
    if (mySide !== "player" || state.activeSide !== "opponent" || status === "Master responds") return;
    const autoTurnKey = `${battleId}:${state.turn}`;
    if (npcAutoTurnKeyRef.current === autoTurnKey) return;
    npcAutoTurnKeyRef.current = autoTurnKey;

    let cancelled = false;

    async function resolveNpcTurn() {
      try {
        setStatus("Master responds");
        const token = await getAccessToken();
        const response = await fetch(`/api/battles/${battleId}/npc-turn`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` }
        });
        const payload = (await response.json()) as { state?: BattleState; events?: TurnEvent[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not resolve master turn.");
        if (cancelled) return;
        if (payload.state) setState(ensureActiveSide(payload.state));
        if (payload.events) setEvents(payload.events);
        setStatus("");
      } catch (error) {
        npcAutoTurnKeyRef.current = "";
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not resolve master turn.");
      }
    }

    void resolveNpcTurn();

    return () => {
      cancelled = true;
    };
  }, [battleId, battleMode, battleStatus, mySide, state, status]);

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

  async function shareResult() {
    if (!state?.winner) return;
    const visibleState = mySide === "opponent" ? swapBattleState(state) : state;
    const result = buildResultSummary(visibleState, getDisplayEvents(events, mySide));
    const payload = buildResultSharePayload(result, battleMode);
    try {
      const outcome = await nativeShareOrCopy(payload);
      setShareStatus(outcome === "shared" ? "Result shared." : "Result copied.");
    } catch {
      setShareStatus("Could not share result.");
    }
  }

  async function createRematchLobby() {
    if (!battleId || rematchBusy) return;
    setRematchBusy(true);
    setRematchStatus(battleMode === "npc" ? "Restarting master challenge..." : "Creating rematch code...");
    try {
      const token = await getAccessToken();
      if (battleMode === "npc") {
        const response = await fetch("/api/masters/challenge", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ petId: state?.player.id, masterKey: npcMasterKey ?? state?.opponent.id.replace(/^npc-/, "") })
        });
        const payload = (await response.json()) as { battleId?: string; error?: string };
        if (!response.ok || !payload.battleId) throw new Error(payload.error ?? "Could not restart challenge.");
        router.push(`/battle/${payload.battleId}`);
        return;
      }
      const response = await fetch(`/api/battles/${battleId}/rematch`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { lobby?: { code: string }; error?: string };
      if (!response.ok || !payload.lobby) throw new Error(payload.error ?? "Could not create rematch.");
      setRematchCode(payload.lobby.code);
      setRematchStatus("Share this rematch code.");
      await navigator.clipboard?.writeText(payload.lobby.code).catch(() => undefined);
    } catch (error) {
      setRematchStatus(error instanceof Error ? error.message : "Could not create rematch.");
    } finally {
      setRematchBusy(false);
    }
  }

  const latestAttack = [...events].reverse().find((event) => event.kind === "damage");
  const displayState = mySide === "opponent" ? swapBattleState(state) : state;
  const displayEvents = getDisplayEvents(events, mySide);
  const resultSummary = displayState.winner ? buildResultSummary(displayState, displayEvents) : null;
  const displayLatestAttack = mySide === "opponent" && latestAttack?.kind === "damage" ? { ...latestAttack, target: swapSide(latestAttack.target) } : latestAttack;
  const playerAnimation = animationFor("player", displayState.winner, displayLatestAttack);
  const opponentAnimation = animationFor("opponent", displayState.winner, displayLatestAttack);
  const visibleLog = displayState.log.slice(-3);
  const quickMoves = displayState.player.moves.filter((move) => move.category !== "status").slice(0, 2);
  const isClosed = battleStatus !== "active";
  const isPlayerTurn = !isClosed && !displayState.winner && displayState.activeSide === "player";
  const isResolving = status === "Resolving turn..." || status === "Leaving fight..." || status === "Master responds";
  const renderedLogLines = displayState.winner ? [] : visibleLog;
  const turnCopy = getTurnCopy({
    battleId,
    battleMode,
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
      {displayState.winner === "player" ? <PixelConfetti /> : null}
      <div className="battle-stage" aria-label="Codex pet battle arena">
        {showIntro && !displayState.winner ? <MatchIntro battleMode={battleMode} player={displayState.player.name} opponent={displayState.opponent.name} /> : null}
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
        {resultSummary?.levelUp && resultSummary.outcome === "win" ? <LevelUpConfetti /> : null}
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
          {resultSummary ? (
            <ResultPanel
              battleId={battleId}
              onBack={() => router.push("/dashboard")}
              onRematch={createRematchLobby}
              onShare={shareResult}
              rematchBusy={rematchBusy}
              rematchCode={rematchCode}
              rematchStatus={rematchStatus}
              result={resultSummary}
              shareStatus={shareStatus}
              battleMode={battleMode}
            />
          ) : (
            <>
              <div className={commandsLocked ? "command-state command-state-locked" : "command-state command-state-ready"}>
                <strong>{commandsLocked ? "Actions locked" : "Choose action"}</strong>
                <span>{commandsLocked ? turnCopy.detail : `${displayState.player.name} is ready.`}</span>
              </div>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type ResultSummary = {
  outcome: "win" | "loss";
  winner: BattleState["player"];
  xpGained: number;
  levelUp?: { oldLevel: number; newLevel: number };
  newBadges: Array<{ badgeKey: string; label: string; title: string }>;
  recap: {
    totalDamage: number;
    biggestHit: number;
    favoriteMove: string;
  };
  turns: number;
};

function ResultPanel({
  battleMode,
  battleId,
  onBack,
  onRematch,
  onShare,
  rematchBusy,
  rematchCode,
  rematchStatus,
  result,
  shareStatus
}: {
  battleMode: "pvp" | "npc";
  battleId?: string;
  onBack: () => void;
  onRematch: () => void;
  onShare: () => void;
  rematchBusy: boolean;
  rematchCode: string;
  rematchStatus: string;
  result: ResultSummary;
  shareStatus: string;
}) {
  const levelGain = result.levelUp ? result.levelUp.newLevel - result.levelUp.oldLevel : 0;
  const xpPercent = Math.min(100, Math.round((result.winner.xp / xpForNextLevel(result.winner.level)) * 100));
  const isTraining = battleMode === "npc";

  return (
    <div className={result.outcome === "win" ? "result-panel result-panel-win" : "result-panel result-panel-loss"}>
      <div className="result-heading">
        <Trophy size={22} />
        <div>
          <strong>{result.outcome === "win" ? "Victory!" : "Defeat"}</strong>
          <span>{result.winner.name} wins in {result.turns} turns.</span>
        </div>
      </div>
      <div className="result-stats">
        <span><strong>+{result.xpGained}</strong> {isTraining ? "Training XP" : "XP"}</span>
        <span><strong>Lv {result.winner.level}</strong> {result.winner.affinity}</span>
      </div>
      <div className="result-xp-card">
        <div className="result-xp-track">
          <span style={{ "--xp-width": `${xpPercent}%` } as React.CSSProperties} />
        </div>
        <small>{result.winner.xp}/{xpForNextLevel(result.winner.level)} XP to next level</small>
      </div>
      {result.levelUp ? (
        <div className="level-up-card">
          <strong>Level up!</strong>
          <span>Lv {result.levelUp.oldLevel} to Lv {result.levelUp.newLevel}</span>
          <small>HP +{levelGain * 5} / ATK +{levelGain * 2} / DEF +{levelGain * 2} / SPD +{levelGain * 2}</small>
        </div>
      ) : (
        <div className="level-up-card level-up-card-muted">
          <strong>Next level</strong>
          <span>{result.winner.xp}/{xpForNextLevel(result.winner.level)} XP</span>
        </div>
      )}
      <div className="result-recap">
        <span><strong>{result.recap.totalDamage}</strong> damage</span>
        <span><strong>{result.recap.biggestHit}</strong> biggest hit</span>
        <span><strong>{result.recap.favoriteMove}</strong> favorite move</span>
      </div>
      {result.outcome === "win" ? <ShareStrip payload={buildResultSharePayload(result, battleMode)} status={shareStatus} onMore={onShare} /> : null}
      {result.newBadges.length ? (
        <div className="new-badges">
          <strong>New badges</strong>
          <div>
            {result.newBadges.map((badge) => (
              <span className="badge-chip" key={badge.badgeKey}>{badge.label}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="result-actions">
        <button className="dashboard-return-button" onClick={onBack} type="button">
          <Flag size={18} />
          <span>
            <strong>Dashboard</strong>
            <small>Return to roster</small>
          </span>
        </button>
        <button disabled={!battleId || rematchBusy} onClick={onRematch} type="button">
          {rematchBusy ? <LoaderCircle className="spinner" size={18} /> : <RotateCcw size={18} />}
          <span>
            <strong>{isTraining ? "Challenge again" : "Rematch"}</strong>
            <small>{isTraining ? rematchStatus || "Same master" : rematchCode || rematchStatus || (battleId ? "Create code" : "Online only")}</small>
          </span>
        </button>
        <button onClick={onShare} type="button">
          <Copy size={18} />
          <span>
            <strong>{result.outcome === "win" ? "Copy" : "Share"}</strong>
            <small>{shareStatus || "Copy result"}</small>
          </span>
        </button>
      </div>
    </div>
  );
}

function ShareStrip({ onMore, payload, status }: { onMore: () => void; payload: SharePayload; status: string }) {
  return (
    <div className="share-strip" aria-label="Share this win">
      <strong>Tell the arena</strong>
      <div>
        <ShareAnchor icon={<Send size={14} />} label="X" payload={payload} platform="x" />
        <ShareAnchor icon={<MessageCircle size={14} />} label="WhatsApp" payload={payload} platform="whatsapp" />
        <ShareAnchor icon={<Link2 size={14} />} label="LinkedIn" payload={payload} platform="linkedin" />
        <ShareAnchor icon={<strong aria-hidden="true">f</strong>} label="Facebook" payload={payload} platform="facebook" />
        <button className="share-chip" onClick={onMore} type="button">
          <Share2 size={14} />
          <span>{status || "More"}</span>
        </button>
      </div>
    </div>
  );
}

function ShareAnchor({ icon, label, payload, platform }: { icon: React.ReactNode; label: string; payload: SharePayload; platform: SharePlatform }) {
  return (
    <a className="share-chip" href={buildShareLink(platform, payload)} rel="noreferrer" target="_blank">
      {icon}
      <span>{label}</span>
    </a>
  );
}

function buildResultSharePayload(result: ResultSummary, battleMode: "pvp" | "npc"): SharePayload {
  const modeCopy = battleMode === "npc" ? "just humbled a Master" : "just won an arena fight";
  const levelCopy = result.levelUp ? ` and leveled up to Lv ${result.levelUp.newLevel}` : "";
  return {
    title: "Codex Pet Arena win",
    text: `${result.winner.name}, my Codex pet, ${modeCopy}${levelCopy}. Tiny sprite, big attitude. Come hatch one and fight me.`,
    url: getClientShareUrl("/")
  };
}

function getTurnCopy({
  battleId,
  battleMode,
  displayState,
  isClosed,
  isPlayerTurn,
  isResolving,
  status
}: {
  battleId?: string;
  battleMode: "pvp" | "npc";
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
      title: battleMode === "npc" ? "Master responds" : "Resolving",
      detail: battleMode === "npc" ? `${displayState.opponent.name} is choosing a counter.` : "The arena is applying the last action.",
      logLine: battleMode === "npc" ? `${displayState.opponent.name} prepares a counter.` : status,
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
      title: battleMode === "npc" ? "Your training turn" : "Your turn",
      detail: `Choose an action for ${displayState.player.name}.`,
      logLine: `Your turn: choose an action for ${displayState.player.name}.`,
      tone: "ready" as const
    };
  }

  return {
    title: battleMode === "npc" ? "Master turn" : `${displayState.opponent.name}'s turn`,
    detail: battleMode === "npc" ? `${displayState.opponent.name} is choosing a counter.` : "Waiting for the opponent to choose.",
    logLine: battleMode === "npc" ? `${displayState.opponent.name} studies the arena.` : `${displayState.opponent.name}'s turn. Waiting for opponent.`,
    tone: "waiting" as const
  };
}

function MatchIntro({ battleMode, opponent, player }: { battleMode: "pvp" | "npc"; opponent: string; player: string }) {
  return (
    <div className="match-intro" aria-hidden="true">
      {battleMode === "npc" ? <span>Master Challenge</span> : null}
      <strong>{opponent}</strong>
      <span>challenges</span>
      <strong>{player}</strong>
      <em>Ready... Fight!</em>
    </div>
  );
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

function buildResultSummary(displayState: BattleState, displayEvents: TurnEvent[]): ResultSummary {
  const winnerSide = displayState.winner ?? "player";
  const xpEvent = [...displayEvents].reverse().find((event) => event.kind === "xp" && event.target === winnerSide);
  const levelUp = [...displayEvents].reverse().find((event) => event.kind === "level-up" && event.target === winnerSide);
  const loserSide = swapSide(winnerSide);
  const damageEvents = displayEvents.filter((event): event is Extract<TurnEvent, { kind: "damage" }> => event.kind === "damage" && event.target === loserSide);
  const usedMoves = new Map<string, number>();
  const winnerName = getPetName(displayState, winnerSide);
  for (const event of displayEvents) {
    if (event.kind !== "message") continue;
    const match = event.text.match(new RegExp(`^${escapeRegex(winnerName)} used (.+)\\.$`));
    if (match?.[1]) usedMoves.set(match[1], (usedMoves.get(match[1]) ?? 0) + 1);
  }
  const favoriteMove = [...usedMoves.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Guard";
  const newBadges = displayEvents
    .filter((event): event is Extract<TurnEvent, { kind: "badge" }> => event.kind === "badge" && event.target === winnerSide)
    .map((event) => ({ badgeKey: event.badgeKey, label: event.label, title: event.title }));

  return {
    outcome: winnerSide === "player" ? "win" : "loss",
    winner: winnerSide === "player" ? displayState.player : displayState.opponent,
    xpGained: xpEvent?.kind === "xp" ? xpEvent.amount : 0,
    levelUp: levelUp?.kind === "level-up" ? { oldLevel: levelUp.oldLevel, newLevel: levelUp.newLevel } : undefined,
    newBadges,
    recap: {
      totalDamage: damageEvents.reduce((total, event) => total + event.amount, 0),
      biggestHit: damageEvents.reduce((max, event) => Math.max(max, event.amount), 0),
      favoriteMove
    },
    turns: displayState.turn
  };
}

function getDisplayEvents(events: TurnEvent[], mySide: BattleSide) {
  if (mySide === "player") return events;
  return events.map((event) => {
    if ("target" in event) return { ...event, target: swapSide(event.target) } as TurnEvent;
    if (event.kind === "winner") return { ...event, winner: swapSide(event.winner) };
    return event;
  });
}

function PixelConfetti() {
  return (
    <div className="pixel-confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, index) => (
        <span key={index} style={{ "--confetti-index": index } as React.CSSProperties} />
      ))}
    </div>
  );
}

function LevelUpConfetti() {
  return (
    <div className="level-up-confetti" aria-hidden="true">
      {Array.from({ length: 48 }, (_, index) => {
        const angle = (index / 48) * Math.PI * 2;
        const radius = 78 + (index % 4) * 22;
        const x = Math.round(Math.cos(angle) * radius);
        const y = Math.round(Math.sin(angle) * radius - 32);
        return (
          <span
            key={index}
            style={{
              "--level-confetti-delay": `${(index % 8) * 24}ms`,
              "--level-confetti-rot": `${index * 31}deg`,
              "--level-confetti-x": `${x}px`,
              "--level-confetti-y": `${y}px`
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
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
