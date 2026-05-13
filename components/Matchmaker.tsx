"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Dices, LoaderCircle, Swords } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RosterPet = {
  id: string;
  name: string;
  level: number;
  xp: number;
  affinity: string;
  moves?: RosterMove[];
};

export type RosterMove = {
  id: string;
  pet_id: string;
  slot: number;
  display_name: string;
  power: number;
  accuracy: number;
  affinity: string;
  max_charges: number;
};

export function Matchmaker({ pets = [], selectedPetId, onSelectPet }: { pets?: RosterPet[]; selectedPetId?: string; onSelectPet?: (petId: string) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [createdLobbyId, setCreatedLobbyId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [randomWaiting, setRandomWaiting] = useState(false);
  const selected = selectedPetId || pets[0]?.id || "";

  useEffect(() => {
    if (!createdLobbyId) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    async function routeToActiveBattle() {
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/battles/active", { headers: { authorization: `Bearer ${token}` } });
        const payload = (await response.json()) as { battle?: { id: string } | null };
        if (!cancelled && payload.battle?.id) router.push(`/battle/${payload.battle.id}`);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not check lobby status.");
      }
    }

    const channel = supabase
      .channel(`lobby:${createdLobbyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${createdLobbyId}` },
        (payload) => {
          const updated = payload.new as { status?: string };
          if (updated.status === "active") void routeToActiveBattle();
        }
      )
      .subscribe();

    const poll = window.setInterval(routeToActiveBattle, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [createdLobbyId, router]);

  useEffect(() => {
    if (!randomWaiting) return;
    let cancelled = false;

    async function routeToActiveBattle() {
      try {
        const token = await getAccessToken();
        const response = await fetch("/api/battles/active", { headers: { authorization: `Bearer ${token}` } });
        const payload = (await response.json()) as { battle?: { id: string } | null };
        if (!cancelled && payload.battle?.id) router.push(`/battle/${payload.battle.id}`);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not check random queue.");
      }
    }

    void routeToActiveBattle();
    const poll = window.setInterval(routeToActiveBattle, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [randomWaiting, router]);

  async function authedFetch(path: string, body: Record<string, unknown>) {
    const token = await getAccessToken();
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Request failed.");
    return payload;
  }

  async function joinRandom() {
    if (!selected) {
      setStatus("Choose or upload a pet first.");
      return;
    }
    try {
      setRandomWaiting(false);
      setStatus("Looking for an opponent...");
      const payload = (await authedFetch("/api/matchmaking/random", { petId: selected })) as { status: string; battleId?: string };
      if (payload.battleId) router.push(`/battle/${payload.battleId}`);
      else {
        setRandomWaiting(true);
        setStatus("Waiting in random queue. You will enter the battle when someone joins.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Random queue failed.");
    }
  }

  async function createCode() {
    if (!selected) {
      setStatus("Choose or upload a pet first.");
      return;
    }
    try {
      setStatus("Creating lobby...");
      const payload = (await authedFetch("/api/lobbies", { petId: selected })) as { lobby: { id: string; code: string } };
      setCode(payload.lobby.code);
      setCreatedLobbyId(payload.lobby.id);
      setStatus("Share this code with a friend. You will enter the battle when they join.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create lobby.");
    }
  }

  async function joinLobby() {
    if (!selected || !joinCode) {
      setStatus("Choose a pet and enter a code.");
      return;
    }
    try {
      const payload = (await authedFetch("/api/lobbies/join", { petId: selected, code: joinCode })) as { battleId: string };
      router.push(`/battle/${payload.battleId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not join lobby.");
    }
  }

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Matchmaking</p>
          <h2>Find a fight</h2>
        </div>
        <Swords size={22} />
      </div>
      {pets.length ? (
        <label>
          Fighter
          <select value={selected} onChange={(event) => onSelectPet?.(event.target.value)}>
            {pets.map((pet) => (
              <option key={pet.id} value={pet.id}>{pet.name} / Lv {pet.level}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="match-grid">
        <button className="match-card match-card-button" onClick={joinRandom} type="button">
          <Dices size={26} />
          <strong>Random</strong>
          <span>{randomWaiting ? <><LoaderCircle className="spinner inline-spinner" size={14} /> Waiting for opponent</> : "Queue into whoever is ready."}</span>
        </button>
        <div className="match-card">
          <Copy size={26} />
          <strong>Create code</strong>
          <code className="lobby-code">{code || "------"}</code>
          {createdLobbyId ? <span><LoaderCircle className="spinner inline-spinner" size={14} /> Waiting for friend</span> : null}
          <button className="secondary-button compact" onClick={createCode} type="button">New code</button>
        </div>
        <div className="match-card">
          <Swords size={26} />
          <strong>Join code</strong>
          <input maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" value={joinCode} />
          <button className="primary-button compact" onClick={joinLobby} type="button">Enter</button>
        </div>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}

async function getAccessToken() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Log in before matchmaking.");
  return token;
}
