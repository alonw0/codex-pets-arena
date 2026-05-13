import Link from "next/link";
import { History, Swords, Upload } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { DashboardClient } from "@/components/DashboardClient";

export default function DashboardPage() {
  return (
    <main className="app-page">
      <AppNav />
      <DashboardClient />
    </main>
  );
}

function AppNav() {
  return (
    <nav className="top-nav app-nav">
      <BrandLogo />
      <div>
        <Link href="/upload"><Upload size={16} /> Upload</Link>
        <Link href="/history"><History size={16} /> History</Link>
        <Link className="nav-cta" href="/battle/demo"><Swords size={16} /> Demo fight</Link>
      </div>
    </nav>
  );
}
