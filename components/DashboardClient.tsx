"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, LoaderCircle, Upload } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Matchmaker, type RosterMove, type RosterPet } from "@/components/Matchmaker";

type Profile = {
  id: string;
  rating: number;
  wins: number;
  losses: number;
};

type DashboardCache = {
  profile: Profile;
  pets: RosterPet[];
  selectedPetId: string;
  cachedAt: number;
};

export function DashboardClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pets, setPets] = useState<RosterPet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const selectedPetIdRef = useRef("");
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState("Loading your trainer room...");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase env vars are missing.");
      setIsLoading(false);
      return;
    }

    async function load() {
      let hasCachedDashboard = false;
      try {
        const sessionResult = await supabase!.auth.getSession();
        const user = sessionResult.data.session?.user;
        if (!user) {
          setStatus("Log in to load your roster and play online.");
          return;
        }

        const cached = readDashboardCache(user.id);
        if (cached) {
          hasCachedDashboard = true;
          setProfile(cached.profile);
          setPets(cached.pets);
          setSelectedPetId(cached.selectedPetId || cached.pets[0]?.id || "");
          selectedPetIdRef.current = cached.selectedPetId || cached.pets[0]?.id || "";
          setStatus(cached.pets.length ? "Choose a pet and find a fight." : "Upload a pet before matchmaking.");
          setIsLoading(false);
          setIsRefreshing(true);
        }
        const preferredPetId = cached?.selectedPetId ?? selectedPetIdRef.current;

        const [{ data: profileData }, { data: petData }] = await Promise.all([
          supabase!.from("profiles").select("id, rating, wins, losses").eq("id", user.id).maybeSingle<Profile>(),
          supabase!.from("pets").select("id, name, level, xp, affinity").eq("owner_id", user.id).eq("active", true).returns<RosterPet[]>()
        ]);
        const loadedPets = petData ?? [];
        const petIds = loadedPets.map((pet) => pet.id);
        const { data: moveData } = petIds.length
          ? await supabase!
              .from("moves")
              .select("id, pet_id, slot, display_name, power, accuracy, affinity, max_charges")
              .in("pet_id", petIds)
              .order("slot", { ascending: true })
              .returns<RosterMove[]>()
          : { data: [] };
        const movesByPet = new Map<string, RosterMove[]>();
        for (const move of moveData ?? []) {
          movesByPet.set(move.pet_id, [...(movesByPet.get(move.pet_id) ?? []), move]);
        }
        const petsWithMoves = loadedPets.map((pet) => ({ ...pet, moves: movesByPet.get(pet.id) ?? [] }));
        const loadedProfile = profileData ?? { id: user.id, rating: 1000, wins: 0, losses: 0 };
        const nextSelectedPetId = petsWithMoves.some((pet) => pet.id === preferredPetId) ? preferredPetId : petsWithMoves[0]?.id ?? "";

        setProfile(loadedProfile);
        setPets(petsWithMoves);
        setSelectedPetId(nextSelectedPetId);
        selectedPetIdRef.current = nextSelectedPetId;
        setStatus(petsWithMoves.length ? "Choose a pet and find a fight." : "Upload a pet before matchmaking.");
        writeDashboardCache(user.id, {
          profile: loadedProfile,
          pets: petsWithMoves,
          selectedPetId: nextSelectedPetId,
          cachedAt: Date.now()
        });
        setIsLoading(false);

        const token = sessionResult.data.session?.access_token;
        if (token) {
          void loadActiveBattle(token).then(setActiveBattleId).catch(() => setActiveBattleId(null));
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load your dashboard.");
      } finally {
        if (!hasCachedDashboard) setIsLoading(false);
        setIsRefreshing(false);
      }
    }

    load();
  }, []);

  return (
    <section className="dashboard-grid">
      <div className="trainer-card">
        <p className="eyebrow">Trainer</p>
        <h1>Ready room</h1>
        <p className="muted">{status}</p>
        {isRefreshing ? <span className="refresh-pill"><LoaderCircle className="spinner" size={14} /> Refreshing</span> : null}
        {activeBattleId ? <Link className="primary-button compact" href={`/battle/${activeBattleId}`}>Reconnect battle</Link> : null}
        <div className="stat-row">
          <span><strong>{isLoading ? "..." : profile?.rating ?? 1000}</strong> Rating</span>
          <span><strong>{isLoading ? "..." : profile?.wins ?? 0}</strong> Wins</span>
          <span><strong>{isLoading ? "..." : pets.length}</strong> Pets</span>
        </div>
      </div>
      {isLoading ? <DashboardLoadingPanel title="Matchmaking" message="Checking your active pet and open battles." /> : <Matchmaker pets={pets} selectedPetId={selectedPetId} onSelectPet={(petId) => {
        selectedPetIdRef.current = petId;
        setSelectedPetId(petId);
      }} />}
      <section className="tool-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Roster</p>
            <h2>Your pets</h2>
          </div>
          <Activity size={22} />
        </div>
        {isLoading ? (
          <div className="dashboard-loading">
            <LoaderCircle className="spinner" size={26} />
            <strong>Loading pets</strong>
            <span>Fetching your roster and generated moves.</span>
          </div>
        ) : pets.length ? (
          <div className="roster-list">
            {pets.map((pet) => (
              <button className={pet.id === selectedPetId ? "roster-row roster-row-active" : "roster-row"} key={pet.id} onClick={() => {
                selectedPetIdRef.current = pet.id;
                setSelectedPetId(pet.id);
              }} type="button">
                <div>
                  <strong>{pet.name}</strong>
                  <span>Lv {pet.level} / {pet.affinity}</span>
                </div>
                <div className="roster-moves">
                  {(pet.moves ?? []).length ? (
                    pet.moves?.map((move) => (
                      <span className="move-chip" key={move.id}>
                        {move.display_name} · {move.power}/{move.accuracy}
                      </span>
                    ))
                  ) : (
                    <span className="move-chip move-chip-muted">No moves yet</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No pets loaded.</p>
            <Link className="primary-button compact" href="/upload"><Upload size={16} /> Upload pet</Link>
          </div>
        )}
      </section>
    </section>
  );
}

async function loadActiveBattle(token: string) {
  const activeResponse = await fetch("/api/battles/active", { headers: { authorization: `Bearer ${token}` } });
  const activeData = (await activeResponse.json()) as { battle?: { id: string } | null };
  return activeData.battle?.id ?? null;
}

function DashboardLoadingPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="tool-panel dashboard-loading-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>Loading</h2>
        </div>
        <LoaderCircle className="spinner" size={22} />
      </div>
      <div className="dashboard-loading">
        <LoaderCircle className="spinner" size={30} />
        <strong>Preparing arena options</strong>
        <span>{message}</span>
      </div>
    </section>
  );
}

function cacheKey(userId: string) {
  return `codex-pet-arena:dashboard:${userId}`;
}

function readDashboardCache(userId: string): DashboardCache | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DashboardCache>;
    if (!parsed.profile || !Array.isArray(parsed.pets)) return null;
    return {
      profile: parsed.profile,
      pets: parsed.pets,
      selectedPetId: typeof parsed.selectedPetId === "string" ? parsed.selectedPetId : "",
      cachedAt: typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0
    };
  } catch {
    return null;
  }
}

function writeDashboardCache(userId: string, cache: DashboardCache) {
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(cache));
  } catch {
    // Cache writes are a UX optimization only.
  }
}
