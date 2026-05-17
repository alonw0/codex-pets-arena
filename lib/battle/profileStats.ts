import type { PostgrestError } from "@supabase/supabase-js";
import type { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function incrementProfileResult(
  supabase: NonNullable<ReturnType<typeof createSupabaseServiceClient>>,
  profileId: string,
  column: "wins" | "losses"
): Promise<{ error: PostgrestError | Error | null; value: number | null }> {
  const { data, error } = await supabase.rpc("increment_profile_result", {
    target_profile_id: profileId,
    result_column: column
  });

  if (error) return { error, value: null };
  return { error: null, value: typeof data === "number" ? data : null };
}
