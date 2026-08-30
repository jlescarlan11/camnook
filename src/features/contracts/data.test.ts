import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadAdminContractContext,
  projectContractHistorySnapshot,
} from "./data";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";

const snapshot = {
  booking: {
    expected_location: "Quezon City",
    id: BOOKING_ID,
    intended_use: "Wedding",
    pickup_at: "2099-08-15T01:00:00Z",
    return_at: "2099-08-16T01:00:00Z",
  },
  camera: {
    accessories: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Battery",
        quantity: 2,
      },
    ],
    id: "11111111-1111-4111-8111-111111111111",
    name: "Fujifilm X-T5",
    serial_number: "XT5-001",
  },
  pricing: {
    billable_days: 1,
    currency: "PHP",
    daily_rate: 1500,
    rental_amount: 1500,
    security_deposit: 5000,
    total_due: 6500,
  },
  renter: { legal_name: "Maria Santos", phone: "+639171234567" },
  template: {
    content_sha256: "a".repeat(64),
    id: "66666666-6666-4666-8666-666666666666",
    schema_version: 1,
    terms: {
      cancellation: "Cancellation term",
      damage: "Damage term",
      loss: "Loss term",
      "late-return": "Late term",
      "non-transferability": "Named renter only",
      pickup: "Pickup term",
      return: "Return term",
    },
    version: "v1",
  },
};

describe("contract read model", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses and projects an immutable contract snapshot", () => {
    const result = projectContractHistorySnapshot(
      [
        {
          booking_id: BOOKING_ID,
          id: VERSION_ID,
          issued_at: "2026-08-15T00:00:00Z",
          signature: {
            id: "44444444-4444-4444-8444-444444444444",
            signed_at: "2026-08-15T01:00:00Z",
          },
          snapshot,
          status: "issued",
          supersedes_id: null,
          version_no: 1,
        },
      ],
      VERSION_ID,
    );

    expect(result).toMatchObject({
      agreement: {
        current: {
          signature: { signedAt: "2026-08-15T01:00:00Z" },
          snapshot: { camera: { serial_number: "XT5-001" } },
          versionNo: 1,
        },
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toContain("signer_ip");
  });

  it("fails closed when the current pointer is stale", () => {
    expect(projectContractHistorySnapshot([], VERSION_ID)).toEqual({
      status: "inconsistent",
    });
  });

  it("rejects a malformed persisted snapshot instead of partially rendering it", () => {
    expect(projectContractHistorySnapshot(
      [
        {
          booking_id: BOOKING_ID,
          id: VERSION_ID,
          issued_at: "2026-08-15T00:00:00Z",
          signature: null,
          snapshot: { ...snapshot, renter: { legal_name: "" } },
          status: "issued",
          supersedes_id: null,
          version_no: 1,
        },
      ],
      VERSION_ID,
    )).toEqual({ status: "error" });
  });

  it("loads the complete admin contract context with one snapshot RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        audit: [{
          action: "sign_contract",
          actor_type: "renter",
          actor_user_id: "77777777-7777-4777-8777-777777777777",
          audit_id: 1,
          contract_version_id: VERSION_ID,
          occurred_at: "2026-08-15T01:00:00Z",
          outcome: "success",
          version_no: 1,
        }],
        cameras: [{
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fujifilm X-T5",
        }],
        versions: [{
          booking_id: BOOKING_ID,
          id: VERSION_ID,
          issued_at: "2026-08-15T00:00:00Z",
          signature: {
            id: "44444444-4444-4444-8444-444444444444",
            signed_at: "2026-08-15T01:00:00Z",
          },
          snapshot,
          status: "issued",
          supersedes_id: null,
          version_no: 1,
        }],
      },
      error: null,
    });
    const context = {
      supabase: {
        from: vi.fn(),
        schema: vi.fn(() => ({ rpc })),
      },
      user: { id: "admin" },
    } as never;

    await expect(
      loadAdminContractContext(context, BOOKING_ID, VERSION_ID),
    ).resolves.toMatchObject({
      agreement: { current: { id: VERSION_ID } },
      cameras: [{ name: "Fujifilm X-T5" }],
      events: [{ action: "sign_contract" }],
      status: "success",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_admin_contract_context", {
      p_booking_id: BOOKING_ID,
    });
  });
});
