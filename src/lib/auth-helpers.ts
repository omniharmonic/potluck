import type { SupabaseClient } from "@supabase/supabase-js";

export async function isHostOrCohost(
  supabase: SupabaseClient,
  potluckId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_host_or_cohost", {
    p_potluck_id: potluckId,
    p_user_id: userId,
  });
  if (error) return false;
  return data === true;
}
