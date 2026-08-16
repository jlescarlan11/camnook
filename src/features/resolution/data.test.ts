import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadMyResolutionState,
  loadResolutionDetail,
  loadResolutionQueues,
} from "./data";

const BOOKING_ID = "93000000-0000-4000-8000-000000000001";

function contextWith(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    context: {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "user" },
    } as never,
    rpc,
  };
}

describe("resolution data loaders", () => {
  it("validates booking identifiers before owner or administrator RPCs", async () => {
    const api = contextWith(null);

    await expect(loadResolutionDetail(api.context, "invalid")).resolves.toEqual({
      status: "missing",
    });
    await expect(loadMyResolutionState(api.context, "invalid")).resolves.toEqual({
      status: "missing",
    });
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("accepts the four strict administrator queues", async () => {
    const api = contextWith({
      cancellation_queue: [],
      deposit_queue: [
        {
          booking_id: BOOKING_ID,
          camera_name: "Camera",
          deduction_amount: 1000,
          held_amount: 4000,
          refunded_amount: 0,
          remaining_refund_liability: 3000,
          renter_legal_name: "Renter",
          status: "pending_refund",
        },
      ],
      issue_queue: [],
      return_queue: [],
    });

    await expect(loadResolutionQueues(api.context)).resolves.toMatchObject({
      queues: { deposit_queue: [{ remaining_refund_liability: 3000 }] },
      status: "success",
    });
  });

  it("accepts the authoritative no-deposit owner projection", async () => {
    const api = contextWith({
      booking_id: BOOKING_ID,
      booking_state: "FOR_REVIEW",
      can_request_cancellation: true,
      cancellation: null,
      deposit: {
        deduction_amount: 0,
        held_amount: 0,
        refunded_amount: 0,
        remaining_refund_liability: 0,
        status: "none",
      },
      issue_decision: null,
      return_inspection: null,
    });

    await expect(loadMyResolutionState(api.context, BOOKING_ID)).resolves.toMatchObject({
      resolution: { deposit: { status: "none" } },
      status: "success",
    });
  });

  it("fails closed when an owner projection includes an internal reason or transfer reference", async () => {
    const api = contextWith({
      booking_id: BOOKING_ID,
      booking_state: "COMPLETED",
      can_request_cancellation: false,
      cancellation: null,
      deposit: {
        deduction_amount: 1000,
        held_amount: 4000,
        refunded_amount: 3000,
        remaining_refund_liability: 0,
        status: "refunded",
      },
      internal_reason: "private evidence basis",
      issue_decision: {
        customer_explanation: "A documented repair deduction was approved.",
        decided_at: "2026-08-16T02:00:00Z",
        decision_kind: "damage",
        deduction_amount: 1000,
      },
      reference: "PRIVATE-TRANSFER-REFERENCE",
      return_inspection: null,
    });

    await expect(loadMyResolutionState(api.context, BOOKING_ID)).resolves.toEqual({
      status: "error",
    });
  });

  it("keeps return-photo paths and hashes out of administrator projections", async () => {
    const api = contextWith({
      booking_id: BOOKING_ID,
      booking_state: "RETURN_REVIEW",
      camera: {
        id: "93000000-0000-4000-8000-000000000002",
        name: "Camera",
      },
      cancellation: null,
      deposit: {
        deduction_amount: 0,
        held_amount: 4000,
        refunded_amount: 0,
        remaining_refund_liability: 4000,
        status: "pending_refund",
      },
      expected_accessories: [],
      issue_decision: null,
      issue_notes: [],
      pickup_at: "2026-08-14T02:00:00Z",
      refunds: [],
      renter: { legal_name: "Renter", phone: "+639171234567" },
      return_at: "2026-08-16T02:00:00Z",
      return_inspection: {
        accessories: [],
        actual_at: "2026-08-16T02:00:00Z",
        camera_condition_summary: "Returned clean.",
        camera_has_damage: false,
        condition_report_id: "93000000-0000-4000-8000-000000000003",
        expected_return_at: "2026-08-16T02:00:00Z",
        handoff_id: "93000000-0000-4000-8000-000000000004",
        has_missing_items: false,
        late_return: false,
        notes: null,
        object_path: "private/path.png",
        photos: [],
      },
    });

    await expect(loadResolutionDetail(api.context, BOOKING_ID)).resolves.toEqual({
      status: "error",
    });
  });
});
