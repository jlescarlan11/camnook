import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function expireDueBookings() {
  const result = await createSupabaseAdminClient()
    .schema("api")
    .rpc("expire_due_bookings", { p_operation_id: randomUUID() });
  const expired = z.number().int().nonnegative().max(100).safeParse(result.data);

  if (result.error || !expired.success) {
    throw new Error("Unable to expire due unsigned bookings");
  }

  return { expired: expired.data };
}
