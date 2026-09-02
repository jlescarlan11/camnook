import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function claimMapboxRoutingBudget(
  actorUserId: string,
  elementCount: number,
) {
  try {
    const result = await createSupabaseAdminClient()
      .schema("api")
      .rpc("claim_mapbox_routing_budget", {
        p_actor_user_id: actorUserId,
        p_element_count: elementCount,
      });
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}
