import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createSupabaseCookieClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server components cannot always write cookies. Reads still work.
        }
      }
    }
  });
}

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function getBearerUser(request: Request) {
  const supabase = createSupabaseServiceClient();
  if (!supabase) return { supabase: null, user: null, error: "Supabase service env vars are missing." };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { supabase, user: null, error: "Missing bearer token." };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { supabase, user: null, error: error?.message ?? "Invalid bearer token." };

  return { supabase, user: data.user, error: null };
}

export async function ensureProfile(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
  user: User
) {
  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.email === "string"
        ? user.email.split("@")[0]
        : "Trainer";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: displayName
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  return error;
}
