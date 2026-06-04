import Link from "next/link";
import { ArrowLeft, History, LogIn, Swords, Trophy } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { assertUuid } from "@/lib/security/ids";
import { createSupabaseCookieClient } from "@/lib/supabase/server";
import type { BattleState } from "@/lib/battle/types";

export const dynamic = "force-dynamic";

type HistoryBattle = {
  id: string;
  mode: "pvp" | "npc";
  npc_master_key: string | null;
  status: "waiting" | "active" | "complete" | "abandoned";
  winner_id: string | null;
  player_id: string;
  opponent_id: string | null;
  current_turn: number;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  state: BattleState;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getSide(battle: HistoryBattle, userId: string) {
  return battle.player_id === userId ? "player" : "opponent";
}

function getOpponentName(battle: HistoryBattle, userId: string) {
  const side = getSide(battle, userId);
  if (battle.mode === "npc") return battle.state.opponent.name;
  return side === "player" ? battle.state.opponent.name : battle.state.player.name;
}

function getPetName(battle: HistoryBattle, userId: string) {
  const side = getSide(battle, userId);
  return side === "player" ? battle.state.player.name : battle.state.opponent.name;
}

function getResult(battle: HistoryBattle, userId: string) {
  if (battle.status === "active" || battle.status === "waiting") {
    return { label: "In progress", className: "history-status active" };
  }

  if (battle.status === "abandoned") {
    return { label: "Left arena", className: "history-status abandoned" };
  }

  const side = getSide(battle, userId);
  const stateWinner = battle.state.winner;
  const userWonByState = stateWinner === side;
  const userLostByState = Boolean(stateWinner) && stateWinner !== side;
  const userWonById = battle.winner_id === userId;
  const userLostById = Boolean(battle.winner_id) && battle.winner_id !== userId;

  if (userWonByState || userWonById) {
    return { label: "Win", className: "history-status win" };
  }

  if (userLostByState || userLostById) {
    return { label: "Loss", className: "history-status loss" };
  }

  return { label: "Complete", className: "history-status complete" };
}

export default async function HistoryPage() {
  const supabase = await createSupabaseCookieClient();
  const { data: authData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = authData.user;
  let battles: HistoryBattle[] = [];
  let errorMessage: string | null = null;

  if (supabase && user) {
    const userId = assertUuid(user.id);
    const { data, error } = await supabase
      .from("battles")
      .select("id, mode, npc_master_key, status, winner_id, player_id, opponent_id, current_turn, created_at, completed_at, updated_at, state")
      .or(`player_id.eq.${userId},opponent_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      errorMessage = error.message;
    } else {
      battles = (data ?? []) as HistoryBattle[];
    }
  }

  return (
    <main className="center-page wide">
      <BrandLogo href="/dashboard" compact />
      <section className="tool-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Match History</p>
            <h1>Recent battles</h1>
          </div>
          <History size={24} />
        </div>

        {!supabase ? (
          <div className="empty-state">
            <div>
              <strong>Supabase is not configured.</strong>
              <span>Add the Supabase environment variables to load match history.</span>
            </div>
          </div>
        ) : !user ? (
          <div className="empty-state">
            <div>
              <strong>Sign in to see your battles.</strong>
              <span>Your match history is private to your trainer account.</span>
            </div>
            <Link className="primary-button" href="/auth">
              <LogIn size={18} /> Login
            </Link>
          </div>
        ) : errorMessage ? (
          <div className="empty-state">
            <div>
              <strong>Could not load history.</strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        ) : battles.length === 0 ? (
          <div className="empty-state">
            <div>
              <strong>No matches yet.</strong>
              <span>Start a random fight, create a code, or challenge a master.</span>
            </div>
            <Link className="primary-button" href="/dashboard">
              <Swords size={18} /> Find a fight
            </Link>
          </div>
        ) : (
          <div className="history-list">
            {battles.map((battle) => {
              const result = getResult(battle, user.id);
              const opponentName = getOpponentName(battle, user.id);
              const petName = getPetName(battle, user.id);
              const endedAt = battle.completed_at ?? battle.updated_at ?? battle.created_at;

              return (
                <article key={battle.id} className="history-row">
                  <div className="history-row-main">
                    <div className="history-row-title">
                      <strong>{petName}</strong>
                      <span>vs</span>
                      <strong>{opponentName}</strong>
                    </div>
                    <div className="history-row-meta">
                      <span>{battle.mode === "npc" ? "Master Challenge" : "PvP Battle"}</span>
                      <span>Turn {battle.current_turn}</span>
                      <span>{formatDate(endedAt)}</span>
                    </div>
                  </div>
                  <div className={result.className}>
                    {result.label === "Win" ? <Trophy size={16} /> : null}
                    {result.label}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="history-footer">
          <Link className="secondary-button" href="/dashboard">
            <ArrowLeft size={18} /> Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
