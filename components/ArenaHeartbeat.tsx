"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export function ArenaHeartbeat() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    async function sendHeartbeat() {
      const { data } = await supabase!.auth.getSession();
      const token = data.session?.access_token;
      if (!token || cancelled) return;

      await fetch("/api/arena/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      }).catch(() => {
        // Presence is a soft signal; failed heartbeats should not interrupt play.
      });
    }

    void sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
