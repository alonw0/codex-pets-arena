"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Crown, Dices, Link2, LoaderCircle, MessageCircle, Send, Share2, Swords } from "lucide-react";
import { NPC_MASTERS } from "@/lib/battle/masters";
import { buildShareLink, getClientShareUrl, nativeShareOrCopy, type SharePayload, type SharePlatform } from "@/lib/share";
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
  const [inviteShareStatus, setInviteShareStatus] = useState("");
  const [status, setStatus] = useState("");
  const [randomWaiting, setRandomWaiting] = useState(false);
  const [randomBusy, setRandomBusy] = useState(false);
  const [showMasterOffer, setShowMasterOffer] = useState(false);
  const [masterBusy, setMasterBusy] = useState("");
  const selected = selectedPetId || pets[0]?.id || "";
  const selectedPet = pets.find((pet) => pet.id === selected);
  const recommendedMaster = pickRecommendedMaster(selectedPet?.level ?? 1);

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

  useEffect(() => {
    if (!randomWaiting) {
      setShowMasterOffer(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowMasterOffer(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, [randomWaiting]);

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
      setRandomBusy(true);
      setRandomWaiting(false);
      setShowMasterOffer(false);
      setStatus("Looking for an opponent...");
      const payload = (await authedFetch("/api/matchmaking/random", { petId: selected })) as { status: string; battleId?: string };
      if (payload.battleId) {
        router.push(`/battle/${payload.battleId}`);
      }
      else {
        setRandomWaiting(true);
        setStatus("Waiting in random queue. You will enter the battle when someone joins.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Random queue failed.");
    } finally {
      setRandomBusy(false);
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
      setInviteShareStatus("");
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

  async function challengeMaster(masterKey: string) {
    if (!selected) {
      setStatus("Choose or upload a pet first.");
      return;
    }
    try {
      setRandomWaiting(false);
      setShowMasterOffer(false);
      setMasterBusy(masterKey);
      setStatus("Opening master challenge...");
      const payload = (await authedFetch("/api/masters/challenge", { petId: selected, masterKey })) as { battleId: string };
      router.push(`/battle/${payload.battleId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start master challenge.");
    } finally {
      setMasterBusy("");
    }
  }

  async function shareInvite() {
    if (!code) return;
    try {
      const outcome = await nativeShareOrCopy(buildInviteSharePayload(code, selectedPet?.name));
      setInviteShareStatus(outcome === "shared" ? "Invite shared." : "Invite copied.");
    } catch {
      setInviteShareStatus("Could not share invite.");
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
        <button className="match-card match-card-button" disabled={randomBusy} onClick={joinRandom} type="button">
          {randomBusy || randomWaiting ? <LoaderCircle className="spinner" size={26} /> : <Dices size={26} />}
          <strong>Random</strong>
          <span>{randomBusy ? "Joining random queue..." : randomWaiting ? <><LoaderCircle className="spinner inline-spinner" size={14} /> Waiting for opponent</> : "Queue into whoever is ready."}</span>
        </button>
        <div className="match-card">
          <Copy size={26} />
          <strong>Create code</strong>
          <code className="lobby-code">{code || "------"}</code>
          {createdLobbyId ? <span><LoaderCircle className="spinner inline-spinner" size={14} /> Waiting for friend</span> : null}
          <button className="secondary-button compact" onClick={createCode} type="button">New code</button>
          {code ? <InviteShare code={code} onMore={shareInvite} petName={selectedPet?.name} status={inviteShareStatus} /> : null}
        </div>
        <div className="match-card">
          <Swords size={26} />
          <strong>Join code</strong>
          <input maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" value={joinCode} />
          <button className="primary-button compact" onClick={joinLobby} type="button">Enter</button>
        </div>
      </div>
      {showMasterOffer ? (
        <div className="queue-fallback-offer">
          <div>
            <strong>No trainer yet?</strong>
            <span>Keep waiting for PvP, or challenge {recommendedMaster.name} for reduced training XP.</span>
          </div>
          <button className="primary-button compact" disabled={Boolean(masterBusy)} onClick={() => challengeMaster(recommendedMaster.key)} type="button">
            {masterBusy === recommendedMaster.key ? <LoaderCircle className="spinner inline-spinner" size={14} /> : <Crown size={16} />}
            Fight {recommendedMaster.name}
          </button>
        </div>
      ) : null}
      <div className="masters-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PvE training</p>
            <h3>Challenge Masters</h3>
          </div>
          <Crown size={22} />
        </div>
        <p className="muted">Fight curated NPC masters for reduced training XP while the arena fills up.</p>
        <div className="masters-grid">
          {NPC_MASTERS.map((master) => (
            <button className="master-card" disabled={!selected || Boolean(masterBusy)} key={master.key} onClick={() => challengeMaster(master.key)} type="button">
              <span className="master-card-topline">
                <strong>{master.name}</strong>
                <small>Lv {master.level}</small>
              </span>
              <span>{master.title}</span>
              <small>{master.difficulty} / {master.affinity}</small>
              {masterBusy === master.key ? <small><LoaderCircle className="spinner inline-spinner" size={13} /> Starting</small> : null}
            </button>
          ))}
        </div>
      </div>
      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}

function InviteShare({ code, onMore, petName, status }: { code: string; onMore: () => void; petName?: string; status: string }) {
  const payload = buildInviteSharePayload(code, petName);
  return (
    <div className="invite-share">
      <strong>Invite a challenger</strong>
      <div>
        <ShareAnchor icon={<Send size={13} />} label="X" payload={payload} platform="x" />
        <ShareAnchor icon={<MessageCircle size={13} />} label="WhatsApp" payload={payload} platform="whatsapp" />
        <ShareAnchor icon={<Link2 size={13} />} label="LinkedIn" payload={payload} platform="linkedin" />
        <button className="share-chip share-chip-compact" onClick={onMore} type="button">
          <Share2 size={13} />
          <span>{status || "More"}</span>
        </button>
      </div>
    </div>
  );
}

function ShareAnchor({ icon, label, payload, platform }: { icon: React.ReactNode; label: string; payload: SharePayload; platform: SharePlatform }) {
  return (
    <a className="share-chip share-chip-compact" href={buildShareLink(platform, payload)} rel="noreferrer" target="_blank">
      {icon}
      <span>{label}</span>
    </a>
  );
}

function buildInviteSharePayload(code: string, petName?: string): SharePayload {
  const petCopy = petName ? `${petName}, my Codex pet,` : "My Codex pet";
  return {
    title: "Challenge my Codex pet",
    text: `${petCopy} is waiting in Codex Pet Arena. Use lobby code ${code} and bring something tougher than vibes.`,
    url: getClientShareUrl("/")
  };
}

function pickRecommendedMaster(level: number) {
  return [...NPC_MASTERS]
    .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || a.level - b.level)[0];
}

async function getAccessToken() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase env vars are missing.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Log in before matchmaking.");
  return token;
}
