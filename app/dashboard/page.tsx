import Link from "next/link";
import { History, LogIn, Swords, Upload } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { DashboardClient } from "@/components/DashboardClient";
import { SignOutButton } from "@/components/SignOutButton";
import { createSupabaseCookieClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseCookieClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const isLoggedIn = Boolean(data.user);

  return (
    <main className="app-page">
      <AppNav isLoggedIn={isLoggedIn} />
      <DashboardClient />
    </main>
  );
}

function AppNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <nav className="top-nav app-nav">
      <BrandLogo />
      <div>
        <Link href="/upload"><Upload size={16} /> Upload</Link>
        <Link href="/history"><History size={16} /> History</Link>
        {isLoggedIn ? <SignOutButton /> : <Link className="nav-auth-button" href="/auth"><LogIn size={16} /> Login</Link>}
        <Link className="nav-cta" href="/battle/demo"><Swords size={16} /> Demo fight</Link>
      </div>
    </nav>
  );
}
