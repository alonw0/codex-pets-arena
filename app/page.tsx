import Link from "next/link";
import { Gamepad2, Upload, Users } from "lucide-react";
import { BattleArena } from "@/components/BattleArena";
import { BrandLogo } from "@/components/BrandLogo";
import { createSupabaseCookieClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseCookieClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const isLoggedIn = Boolean(data.user);

  return (
    <main className="home-page">
      <nav className="top-nav">
        <BrandLogo />
        <div>
          {!isLoggedIn ? <Link href="/auth">Login</Link> : null}
          <Link className="nav-cta" href="/dashboard">Dashboard</Link>
        </div>
      </nav>
      <section className="hero-arena">
        <div className="hero-copy">
          <p className="eyebrow">Multiplayer sprite battles</p>
          <h1>Codex pets finally have a place to settle it.</h1>
          <p>
            Upload a hatched pet, enter a random queue, or share a lobby code with a friend.
            Battles resolve like a classic turn-based handheld fight with realtime readiness and server-authored turns.
          </p>
          <div className="button-row">
            <Link className="primary-button" href="/dashboard"><Gamepad2 size={18} /> Enter arena</Link>
            <Link className="secondary-button" href="/upload"><Upload size={18} /> Upload pet</Link>
          </div>
        </div>
        <div className="hero-battle-preview">
          <BattleArena />
        </div>
      </section>
      <section className="feature-strip">
        <article>
          <Upload size={24} />
          <h2>Upload</h2>
          <p>Validate the exact Codex atlas and keep the pet files in Supabase Storage.</p>
        </article>
        <article>
          <Users size={24} />
          <h2>Match</h2>
          <p>Random queue or friend-code lobbies with realtime presence.</p>
        </article>
        <article>
          <Gamepad2 size={24} />
          <h2>Battle</h2>
          <p>Four moves, levels, statuses, affinity matchups, charge counts, and battle history.</p>
        </article>
      </section>
    </main>
  );
}
