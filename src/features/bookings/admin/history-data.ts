import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { bookingStates } from "@/domain/bookings/state-machine";
import { BOOKING_HISTORY_PAGE_SIZE, type BookingHistoryFilters } from "./history-filters";

const historyRowSchema = z.object({
  id: z.uuid(),
  state: z.enum(bookingStates),
  pickup_at: z.iso.datetime({ offset: true }),
  return_at: z.iso.datetime({ offset: true }),
  requested_at: z.iso.datetime({ offset: true }),
  profiles: z.object({ legal_name: z.string() }),
  cameras: z.object({ name: z.string() }),
});

export type BookingHistoryRow = z.infer<typeof historyRowSchema>;
type HistoryResult = { status: "success"; bookings: BookingHistoryRow[]; hasNext: boolean } | { status: "error" };

// Call only after requirePageAdmin, using that context's authenticated client.
export async function loadBookingHistory(supabase: SupabaseClient<Database>, filters: BookingHistoryFilters): Promise<HistoryResult> {
  let query = supabase.from("bookings")
    .select("id,state,pickup_at,return_at,requested_at,profiles!inner(legal_name),cameras!inner(name)");
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.renter) query = query.ilike("profiles.legal_name", `%${filters.renter}%`);
  const start = (filters.page - 1) * BOOKING_HISTORY_PAGE_SIZE;
  const { data, error } = await query
    .order("requested_at", { ascending: false }).order("id", { ascending: false })
    .range(start, start + BOOKING_HISTORY_PAGE_SIZE);
  const parsed = z.array(historyRowSchema).safeParse(data);
  if (error || !parsed.success) return { status: "error" };
  return {
    status: "success",
    bookings: parsed.data.slice(0, BOOKING_HISTORY_PAGE_SIZE),
    hasNext: parsed.data.length > BOOKING_HISTORY_PAGE_SIZE,
  };
}
