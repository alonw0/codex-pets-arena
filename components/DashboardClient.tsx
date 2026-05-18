"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, LoaderCircle, Trash2, Upload, Users } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { xpForNextLevel } from "@/lib/battle/progression";
import { hydrateBadge, type EarnedBadge } from "@/lib/battle/badges";
import { Matchmaker, type RosterMove, type RosterPet } from "@/components/Matchmaker";
import type { ArenaStats } from "@/lib/arena/stats";

type Profile = {
  id: string;
  rating: number;
  wins: number;
  losses: number;
};

type DashboardCache = {
  profile: Profile;
  pets: RosterPet[];
  badges: EarnedBadge[];
  selectedPetId: string;
  cachedAt: number;
};

export function DashboardClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pets, setPets] = useState<RosterPet[]>([]);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const selectedPetIdRef = useRef("");
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [arenaStats, setArenaStats] = useState<ArenaStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [removingPetId, setRemovingPetId] = useState("");
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
          setBadges(cached.badges);
          setSelectedPetId(cached.selectedPetId || cached.pets[0]?.id || "");
          selectedPetIdRef.current = cached.selectedPetId || cached.pets[0]?.id || "";
          setStatus(cached.pets.length ? "Choose a pet and find a fight." : "Upload a pet before matchmaking.");
          setIsLoading(false);
          setIsRefreshing(true);
        }
        const preferredPetId = cached?.selectedPetId ?? selectedPetIdRef.current;

        const [{ data: profileData }, { data: petData }, { data: badgeData }] = await Promise.all([
          supabase!.from("profiles").select("id, rating, wins, losses").eq("id", user.id).maybeSingle<Profile>(),
          supabase!.from("pets").select("id, name, level, xp, affinity, thumbnail_path").eq("owner_id", user.id).eq("active", true).returns<RosterPet[]>(),
          supabase!.from("profile_badges").select("badge_key, earned_at").eq("profile_id", user.id).order("earned_at", { ascending: false })
        ]);
        const loadedPets = addThumbnailUrls(supabase!, petData ?? []);
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
        const loadedBadges = (badgeData ?? [])
          .map((badge) => hydrateBadge(String(badge.badge_key), typeof badge.earned_at === "string" ? badge.earned_at : undefined))
          .filter((badge): badge is EarnedBadge => Boolean(badge));
        const nextSelectedPetId = petsWithMoves.some((pet) => pet.id === preferredPetId) ? preferredPetId : petsWithMoves[0]?.id ?? "";

        setProfile(loadedProfile);
        setPets(petsWithMoves);
        setBadges(loadedBadges);
        setSelectedPetId(nextSelectedPetId);
        selectedPetIdRef.current = nextSelectedPetId;
        setStatus(petsWithMoves.length ? "Choose a pet and find a fight." : "Upload a pet before matchmaking.");
        writeDashboardCache(user.id, {
          profile: loadedProfile,
          pets: petsWithMoves,
          badges: loadedBadges,
          selectedPetId: nextSelectedPetId,
          cachedAt: Date.now()
        });
        setIsLoading(false);

        const token = sessionResult.data.session?.access_token;
        if (token) {
          void loadActiveBattle(token).then(setActiveBattleId).catch(() => setActiveBattleId(null));
          if (petsWithMoves.some((pet) => !pet.thumbnail_path)) {
            window.setTimeout(() => {
              void backfillThumbnails(token, supabase!, petsWithMoves, (nextPets) => {
                setPets(nextPets);
                writeDashboardCache(user.id, {
                  profile: loadedProfile,
                  pets: nextPets,
                  badges: loadedBadges,
                  selectedPetId: selectedPetIdRef.current || nextSelectedPetId,
                  cachedAt: Date.now()
                });
              });
            }, 3000);
          }
        }
        void loadArenaStats().then(setArenaStats).catch(() => setArenaStats(null));
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
      <div className="dashboard-column dashboard-column-side">
        <div className="trainer-card">
          <p className="eyebrow">Trainer</p>
          <h1>Ready room</h1>
          <p className="muted">{status}</p>
          {isRefreshing ? <span className="refresh-pill"><LoaderCircle className="spinner" size={14} /> Refreshing</span> : null}
          {activeBattleId ? <Link className="primary-button compact" href={`/battle/${activeBattleId}`}>Reconnect battle</Link> : null}
          {badges.length ? (
            <div className="trainer-badges">
              {badges.slice(0, 3).map((badge) => (
                <span className="badge-chip" key={badge.key} title={badge.description}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={badge.iconPath} />
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="stat-row">
            <span><strong>{isLoading ? "..." : profile?.wins ?? 0}</strong> Wins</span>
            <span><strong>{isLoading ? "..." : profile?.losses ?? 0}</strong> Losses</span>
            <span><strong>{isLoading ? "..." : pets.length}</strong> Your pets</span>
          </div>
        </div>
        <section className="tool-panel arena-activity-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Arena</p>
              <h2>Live activity</h2>
            </div>
            <Users size={22} />
          </div>
          <p className="muted">Public arena totals. Online means seen in the last 15 minutes.</p>
          <div className="arena-stats arena-stats-dashboard" aria-label="Arena activity">
            <span><strong>{arenaStats ? formatCount(arenaStats.pets) : "..."}</strong> Arena pets</span>
            <span><strong>{arenaStats ? formatCount(arenaStats.trainers) : "..."}</strong> Trainers</span>
            <span><strong>{arenaStats ? formatCount(arenaStats.online) : "..."}</strong> Online</span>
          </div>
        </section>
      </div>
      <div className="dashboard-column dashboard-column-main">
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
                <div className={pet.id === selectedPetId ? "roster-row roster-row-active" : "roster-row"} key={pet.id}>
                  <button className="roster-select-button" onClick={() => {
                    selectedPetIdRef.current = pet.id;
                    setSelectedPetId(pet.id);
                  }} type="button">
                    <div className="roster-card-main">
                      <div className="roster-thumb" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {pet.thumbnail_url ? <img alt="" src={pet.thumbnail_url} /> : <span>{pet.name.slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <div className="roster-card-name">
                        <strong>{pet.name}</strong>
                        <span>{pet.affinity}</span>
                      </div>
                      <strong className="level-badge">Lv {pet.level}</strong>
                      <div className="roster-xp">
                        <div className="roster-xp-track">
                          <span style={{ width: `${Math.min(100, Math.round((pet.xp / xpForNextLevel(pet.level)) * 100))}%` }} />
                        </div>
                        <small>{pet.xp}/{xpForNextLevel(pet.level)} XP</small>
                      </div>
                      <div className="pet-title-slots">
                        {badges.slice(0, 2).length ? badges.slice(0, 2).map((badge) => (
                          <span className="title-chip" key={`${pet.id}-${badge.key}`}>{badge.title}</span>
                        )) : <span className="title-chip title-chip-empty">No title yet</span>}
                      </div>
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
                  <button
                    aria-label={`Remove ${pet.name}`}
                    className="roster-remove-button"
                    disabled={removingPetId === pet.id}
                    onClick={() => void removePet(pet)}
                    title={`Remove ${pet.name}`}
                    type="button"
                  >
                    {removingPetId === pet.id ? <LoaderCircle className="spinner" size={18} /> : <Trash2 size={18} />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No pets loaded.</p>
              <Link className="primary-button compact" href="/upload"><Upload size={16} /> Upload pet</Link>
            </div>
          )}
        </section>
      </div>
    </section>
  );

  async function removePet(pet: RosterPet) {
    const approved = window.confirm(`Remove ${pet.name} from your roster?\n\nThis hides the pet from matchmaking and your dashboard. Only your own pets can be removed.`);
    if (!approved || removingPetId) return;

    setRemovingPetId(pet.id);
    try {
      const supabase = createSupabaseBrowserClient();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      const userId = session?.data.session?.user.id;
      if (!token || !userId) throw new Error("Log in again to remove pets.");

      const response = await fetch(`/api/pets/${pet.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove pet.");

      const nextPets = pets.filter((candidate) => candidate.id !== pet.id);
      const nextSelectedPetId = selectedPetId === pet.id ? nextPets[0]?.id ?? "" : selectedPetId;
      setPets(nextPets);
      setSelectedPetId(nextSelectedPetId);
      selectedPetIdRef.current = nextSelectedPetId;
      setStatus(nextPets.length ? "Pet removed. Choose a pet and find a fight." : "Pet removed. Upload a pet before matchmaking.");
      if (profile) {
        writeDashboardCache(userId, {
          profile,
          pets: nextPets,
          badges,
          selectedPetId: nextSelectedPetId,
          cachedAt: Date.now()
        });
      }
    } catch (removeError) {
      setStatus(removeError instanceof Error ? removeError.message : "Could not remove pet.");
    } finally {
      setRemovingPetId("");
    }
  }
}

async function loadActiveBattle(token: string) {
  const activeResponse = await fetch("/api/battles/active", { headers: { authorization: `Bearer ${token}` } });
  const activeData = (await activeResponse.json()) as { battle?: { id: string } | null };
  return activeData.battle?.id ?? null;
}

async function loadArenaStats() {
  const response = await fetch("/api/arena/stats");
  if (!response.ok) throw new Error("Could not load arena stats.");
  return response.json() as Promise<ArenaStats>;
}

async function backfillThumbnails(
  token: string,
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
  currentPets: RosterPet[],
  onUpdated: (pets: RosterPet[]) => void
) {
  const response = await fetch("/api/pets/backfill-thumbnails", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) return;
  const payload = (await response.json()) as { updated?: Array<{ id: string; thumbnail_path: string }> };
  if (!payload.updated?.length) return;

  const thumbnailByPet = new Map(payload.updated.map((pet) => [pet.id, pet.thumbnail_path]));
  onUpdated(currentPets.map((pet) => {
    const thumbnailPath = thumbnailByPet.get(pet.id);
    if (!thumbnailPath) return pet;
    return {
      ...pet,
      thumbnail_path: thumbnailPath,
      thumbnail_url: supabase.storage.from("pet-assets").getPublicUrl(thumbnailPath).data.publicUrl
    };
  }));
}

function addThumbnailUrls(supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>, pets: RosterPet[]) {
  return pets.map((pet) => ({
    ...pet,
    thumbnail_url: pet.thumbnail_path ? supabase.storage.from("pet-assets").getPublicUrl(pet.thumbnail_path).data.publicUrl : null
  }));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
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
      badges: Array.isArray(parsed.badges) ? parsed.badges as EarnedBadge[] : [],
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
