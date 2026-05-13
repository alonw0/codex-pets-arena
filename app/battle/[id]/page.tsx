import { BattleArena } from "@/components/BattleArena";
import { BrandLogo } from "@/components/BrandLogo";

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="battle-page">
      <nav className="top-nav app-nav">
        <BrandLogo href="/dashboard" />
        <div>
          <span className="room-pill">Room {id.toUpperCase()}</span>
        </div>
      </nav>
      <BattleArena battleId={id === "demo" ? undefined : id} />
    </main>
  );
}
