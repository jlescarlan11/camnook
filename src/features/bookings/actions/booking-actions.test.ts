import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ getAuthenticatedUser: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { getAuthenticatedUser, requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quoteBooking } from "./quote-booking";
import { requestBooking } from "./request-booking";
import { saveProfile } from "./profile";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries({
    camera: CAMERA_ID,
    expectedLocation: "Cebu City",
    handoffTime: "09:00",
    intendedUse: "Family portraits",
    legalName: "Maria Santos",
    operationId: "33333333-3333-4333-8333-333333333333",
    phone: "+63 917 123 4567",
    pickupDate: "2099-08-24",
    policyVersion: "3",
    meetupPlaceId: "44444444-4444-4444-8444-444444444444", meetupPlaceVersion: "1",
    returnDate: "2099-08-26",
    ...values,
  }).forEach(([name, value]) => data.set(name, value));
  return data;
}

function rpcClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc, schema: vi.fn(() => ({ rpc })) };
}

describe("booking actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an expired session to checkout with the complete schedule", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    await expect(requestBooking({ status: "idle" }, fields({}))).rejects.toThrow("redirect:/login?next=%2Fcheckout%3F");
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([["40001", "schedule_changed"], ["23P01", "unavailable"], ["55000", "unavailable"]])("rejects stale or unavailable checkout on %s", async (code, error) => {
    const profileRpc = vi.fn().mockResolvedValue({ data: { account_status: "active" }, error: null });
    const requestRpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ supabase: rpcClient(profileRpc), user: { id: "renter" } } as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(rpcClient(requestRpc) as never);
    const result = await requestBooking({ status: "idle" }, fields({ totalDue: "0", renterId: "other" }));
    expect(result).toMatchObject({ status: "error", error, values: { intendedUse: "Family portraits" } });
    expect(requestRpc.mock.calls[0][1]).toEqual({
      p_camera_id: CAMERA_ID, p_expected_location: "Cebu City", p_handoff_time: "09:00", p_intended_use: "Family portraits", p_pickup_date: "2099-08-24", p_policy_version: 3, p_place_id: "44444444-4444-4444-8444-444444444444", p_place_version: 1, p_renter_id: "renter", p_return_date: "2099-08-26", p_operation_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("quotes only a complete schedule", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ billable_days: 2, camera_id: CAMERA_ID, currency: "PHP", daily_rate: 750, pickup_at: "2099-08-24T01:00:00Z", rental_amount: 1500, return_at: "2099-08-26T01:00:00Z", security_deposit: 3000, total_due: 4500 }], error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(rpcClient(rpc) as never);
    const result = await quoteBooking({ status: "idle" }, fields({ generation: "4" }));
    expect(result).toMatchObject({ status: "success", submissionGeneration: 4 });
    expect(rpc).toHaveBeenCalledWith("quote_booking_schedule", { p_camera_id: CAMERA_ID, p_handoff_time: "09:00", p_pickup_date: "2099-08-24", p_policy_version: 3, p_return_date: "2099-08-26" });
  });

  it("saves reusable profile fields through the existing profile RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { account_status: "active" }, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: rpcClient(rpc), user: { id: "user-1" } } as never);
    await expect(saveProfile({ status: "idle" }, fields({}))).resolves.toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("ensure_profile", { p_legal_name: "Maria Santos", p_phone: "+63 917 123 4567" });
  });

  it("silently saves name and phone before creating a saved-place request", async () => {
    const profileRpc = vi.fn().mockResolvedValue({ data: { account_status: "active" }, error: null });
    const requestRpc = vi.fn().mockResolvedValue({ data: BOOKING_ID, error: null });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ supabase: rpcClient(profileRpc), user: { id: "user-1" } } as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(rpcClient(requestRpc) as never);
    await expect(requestBooking({ status: "idle" }, fields({}))).rejects.toThrow(`redirect:/account/bookings/${BOOKING_ID}?requested=1`);
    expect(profileRpc).toHaveBeenCalledWith("ensure_profile", { p_legal_name: "Maria Santos", p_phone: "+63 917 123 4567" });
    expect(requestRpc).toHaveBeenCalledWith("request_booking_with_place_idempotent", expect.objectContaining({
      p_expected_location: "Cebu City",
      p_intended_use: "Family portraits",
      p_place_id: "44444444-4444-4444-8444-444444444444", p_place_version: 1,
    }));
  });

  it("rejects incomplete renter details before authentication", async () => {
    const result = await requestBooking({ status: "idle" }, fields({ legalName: "", meetupPlaceId: "" }));
    expect(result).toMatchObject({ error: "invalid_input", fieldErrors: { legalName: expect.any(String), meetupPlace: expect.any(String) } });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });
});
