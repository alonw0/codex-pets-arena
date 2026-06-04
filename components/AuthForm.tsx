"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn, Sparkles } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Log in with the email address you confirmed.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(mode: "signIn" | "signUp") {
    if (isSubmitting) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    setIsSubmitting(true);
    setMessage(mode === "signIn" ? "Logging in..." : "Creating your account...");

    try {
      const result =
        mode === "signIn"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      if (mode === "signIn") {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setMessage("Check your email to confirm your account, then come back and log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSignup = mode === "signUp";

  return (
    <section className="auth-panel">
      <div>
        <p className="eyebrow">Codex Pet Arena</p>
        <h1>{isSignup ? "Create your trainer account." : "Log in to the arena."}</h1>
        <p className="muted">
          {isSignup
            ? "We use email confirmation. After creating your account, open the confirmation link in your inbox before logging in."
            : "Use a confirmed account to upload pets, join fights, and track progression."}
        </p>
      </div>
      <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
        <button disabled={isSubmitting} className={mode === "signIn" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => {
          setMode("signIn");
          setMessage("Log in with the email address you confirmed.");
        }} type="button">
          Log in
        </button>
        <button disabled={isSubmitting} className={mode === "signUp" ? "auth-tab auth-tab-active" : "auth-tab"} onClick={() => {
          setMode("signUp");
          setMessage("Create an account, then confirm your email before logging in.");
        }} type="button">
          Sign up
        </button>
      </div>
      <label>
        Email
        <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" value={email} />
      </label>
      <label>
        Password
        <input autoComplete={isSignup ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} placeholder="********" type="password" value={password} />
      </label>
      <div className="button-row">
        <button className="primary-button auth-submit" disabled={isSubmitting} onClick={() => submit(mode)} type="button">
          {isSubmitting ? <LoaderCircle className="spinner" size={18} /> : isSignup ? <Sparkles size={18} /> : <LogIn size={18} />}
          {isSubmitting ? (isSignup ? "Creating account" : "Logging in") : isSignup ? "Create account" : "Log in"}
        </button>
      </div>
      <div className={isSignup ? "auth-note auth-note-confirm" : "auth-note"}>
        <strong>{isSignup ? "Email confirmation required" : "Account access"}</strong>
        <span>{message}</span>
      </div>
    </section>
  );
}
