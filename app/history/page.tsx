import { History } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export default function HistoryPage() {
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
        <div className="history-list">
          {["Random queue", "Friend code", "Rematch"].map((label, index) => (
            <article key={label} className="history-row">
              <span>{label}</span>
              <strong>{index === 0 ? "Awaiting Supabase data" : "No record yet"}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
