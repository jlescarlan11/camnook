import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";

vi.mock("server-only", () => ({}));

import { loadBookingHistory } from "./history-data";
import { bookingHistoryHref, parseBookingHistoryFilters } from "./history-filters";

const row = {
  id: "95000000-0000-4000-8000-000000000001", state: "CANCELLED",
  pickup_at: "2026-09-28T01:00:00+00:00", return_at: "2026-09-29T01:00:00+00:00",
  requested_at: "2026-09-26T01:00:00+00:00",
  profiles: { legal_name: "Synthetic Renter" }, cameras: { name: "Test camera" },
};

function client(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
  const supabase = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { supabase, fetch };
}

describe("owner booking history", () => {
  it("reads only the summary fields, filters joined renters, and requests one extra row for pagination", async () => {
    const { supabase, fetch } = client(Array.from({ length: 21 }, (_, i) => ({ ...row, id: `95000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })));
    const result = await loadBookingHistory(supabase, { renter: "Synthetic, Renter", state: "CANCELLED", page: 2 });
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected history");
    expect(result.bookings).toHaveLength(20);
    expect(result.hasNext).toBe(true);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/rest/v1/bookings");
    expect(url.searchParams.get("select")).toBe("id,state,pickup_at,return_at,requested_at,profiles!inner(legal_name),cameras!inner(name)");
    expect(url.searchParams.get("profiles.legal_name")).toBe("ilike.%Synthetic, Renter%");
    expect(url.searchParams.get("state")).toBe("eq.CANCELLED");
    expect(url.searchParams.get("order")).toBe("requested_at.desc,id.desc");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("21");
  });

  it("includes closed bookings and distinguishes the last page from a load failure", async () => {
    const { supabase } = client([row]);
    expect(await loadBookingHistory(supabase, { renter: "", state: "", page: 1 })).toEqual({ status: "success", bookings: [row], hasNext: false });
    const empty = client([]);
    expect(await loadBookingHistory(empty.supabase, { renter: "", state: "", page: 1 })).toEqual({ status: "success", bookings: [], hasNext: false });
  });

  it.each([
    [{ message: "permission denied", code: "42501" }, 403],
    [[{ ...row, pickup_at: "bad-date" }], 200],
    [[{ ...row, profiles: null }], 200],
    [null, 200],
  ])("does not present failed or malformed reads as empty history", async (data, status) => {
    const { supabase } = client(data, status as number);
    expect(await loadBookingHistory(supabase, { renter: "", state: "", page: 1 })).toEqual({ status: "error" });
  });

  it("parses defaults and preserves filters in pagination URLs", () => {
    expect(parseBookingHistoryFilters({})).toEqual({ success: true, data: { renter: "", state: "", page: 1 } });
    const parsed = parseBookingHistoryFilters({ renter: " Synthetic Renter ", state: "CANCELLED", page: "2" });
    expect(parsed.success && parsed.data).toEqual({ renter: "Synthetic Renter", state: "CANCELLED", page: 2 });
    const url = new URL(bookingHistoryHref({ renter: "Name & Co", state: "COMPLETED", page: 3 }), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ renter: "Name & Co", state: "COMPLETED", page: "3" });
  });

  it.each([{ state: "UNKNOWN" }, { state: ["ACTIVE", "CANCELLED"] }, { page: "0" }, { page: "1.2" }, { page: "1e5" }, { page: "9007199254740991" }, { renter: "x".repeat(121) }])("rejects invalid filters before making a read: %j", (params) => {
    expect(parseBookingHistoryFilters(params).success).toBe(false);
  });
});
