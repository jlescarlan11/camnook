import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function claimGeoapifyProviderBudget(
  actorUserId: string,
  requestCount: number,
) {
  try {
    const result = await createSupabaseAdminClient()
      .schema("api")
      .rpc("claim_geoapify_provider_budget", {
        p_actor_user_id: actorUserId,
        p_request_count: requestCount,
      });
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}
