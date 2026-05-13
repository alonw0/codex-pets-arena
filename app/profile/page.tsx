import { UserRound } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export default function ProfilePage() {
  return (
    <main className="center-page wide">
      <BrandLogo href="/dashboard" compact />
      <section className="tool-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Trainer settings</h1>
          </div>
          <UserRound size={24} />
        </div>
        <label>
          Display name
          <input placeholder="Your arena name" />
        </label>
        <label>
          Avatar URL
          <input placeholder="https://..." />
        </label>
        <button className="primary-button compact" type="button">Save locally</button>
      </section>
    </main>
  );
}
