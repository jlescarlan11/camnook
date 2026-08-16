import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadActiveRentalQueue,
  loadMyPickupState,
  loadPickupDetail,
  loadPickupQueue,
} from "./data";

const BOOKING_ID = "82000000-0000-4000-8000-000000000001";

function contextWith(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    context: {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "owner" },
    } as never,
    rpc,
  };
}

describe("pickup data loaders", () => {
  it("validates booking identifiers before owner or admin RPCs", async () => {
    const api = contextWith(null);

    await expect(loadPickupDetail(api.context, "invalid")).resolves.toEqual({
      status: "missing",
    });
    await expect(loadMyPickupState(api.context, "invalid")).resolves.toEqual({
      status: "missing",
    });
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("rejects unexpected private fields from every queue projection", async () => {
    const pickupApi = contextWith([
      {
        accessory_count: 0,
        booking_id: BOOKING_ID,
        camera_name: "Camera",
        camera_serial: "PRIVATE-SERIAL",
        identity_check_mode: "original_id_in_person_no_copy",
        pickup_at: "2026-08-16T02:00:00Z",
        readiness: {
          booking_confirmed: true,
          contract_current_signed: true,
          eligible: true,
          in_person_identity_check_required: true,
          payment_verified: true,
          profile_active: true,
        },
        renter_legal_name: "Renter",
        required_checks: [],
        return_at: "2026-08-18T02:00:00Z",
      },
    ]);
    const activeApi = contextWith([
      {
        actual_pickup_at: "2026-08-16T02:00:00Z",
        booking_id: BOOKING_ID,
        camera_name: "Camera",
        expected_return_at: "2026-08-18T02:00:00Z",
        late_amount: 1000,
        renter_legal_name: "Renter",
        renter_phone: "+639171234567",
        urgency: "upcoming",
      },
    ]);

    await expect(loadPickupQueue(pickupApi.context)).resolves.toEqual({
      status: "error",
    });
    await expect(loadActiveRentalQueue(activeApi.context)).resolves.toEqual({
      status: "error",
    });
  });
});
