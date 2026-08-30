import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadGcashRecipientConfiguration,
  loadMyPaymentState,
  loadPaymentAccountingSummary,
  loadPaymentReviewDetail,
  loadPaymentReviewQueue,
} from "./data";

const BOOKING_ID = "71000000-0000-4000-8000-000000000001";
const PAYMENT_ID = "71000000-0000-4000-8000-000000000002";

function contextWith(
  implementation: (name: string, args?: unknown) => Promise<unknown>,
) {
  const rpc = vi.fn(implementation);
  const schema = vi.fn(() => ({ rpc }));
  return {
    context: { supabase: { schema }, user: { id: "owner" } } as never,
    rpc,
  };
}

const ownerState = {
  approval_deadline_at: "2026-08-17T00:00:00Z",
  booking_id: BOOKING_ID,
  booking_state: "PAYMENT_REVIEW",
  can_submit: false,
  instructions: null,
  instructions_error: null,
  proof_policy: {
    allowed_media_types: ["image/jpeg", "image/png"],
    max_byte_size: 5 * 1024 * 1024,
    upload_intent_seconds: 900,
  },
  transaction: {
    id: PAYMENT_ID,
    proof_exists: false,
    rejection_reason_code: null,
    status: "submitted",
    submitted_at: "2026-08-16T00:00:00Z",
  },
};

describe("payment data projections", () => {
  it("loads only the admin GCash recipient configuration projection", async () => {
    const api = contextWith(async () => ({
      data: {
        enabled: true,
        recipient_account: "09171234567",
        recipient_name: "CamNook Recipient",
        version: 4,
      },
      error: null,
    }));

    await expect(
      loadGcashRecipientConfiguration(api.context),
    ).resolves.toMatchObject({
      configuration: { enabled: true, version: 4 },
      status: "success",
    });
    expect(api.rpc).toHaveBeenCalledWith(
      "get_gcash_recipient_configuration_admin",
    );
  });

  it("validates the owner reference before requesting the owner-only RPC", async () => {
    const api = contextWith(async () => ({ data: ownerState, error: null }));

    await expect(loadMyPaymentState(api.context, "invalid")).resolves.toEqual({
      status: "missing",
    });
    expect(api.rpc).not.toHaveBeenCalled();

    await expect(loadMyPaymentState(api.context, BOOKING_ID)).resolves.toMatchObject({
      status: "success",
    });
    expect(api.rpc).toHaveBeenCalledWith("get_my_payment_state", {
      p_booking_id: BOOKING_ID,
    });
  });

  it("rejects unexpected proof paths in the admin queue", async () => {
    const api = contextWith(async () => ({
      data: [
        {
          age_seconds: 1,
          approval_deadline_at: "2026-08-17T00:00:00Z",
          booking_id: BOOKING_ID,
          camera_name: "Camera",
          currency: "PHP",
          declared_amount: 6000,
          object_path: "private/path",
          proof_exists: true,
          reference: "REFERENCE",
          renter_legal_name: "Renter",
          sender_name: "Renter",
          submitted_at: "2026-08-16T00:00:00Z",
          transaction_id: PAYMENT_ID,
        },
      ],
      error: null,
    }));

    await expect(loadPaymentReviewQueue(api.context)).resolves.toEqual({
      status: "error",
    });
  });

  it("loads strict detail then the booking-scoped audit projection", async () => {
    const api = contextWith(async (name) => {
      if (name === "get_payment_review_detail") {
        return {
          data: {
            approval_deadline_at: "2026-08-17T00:00:00Z",
            booking_id: BOOKING_ID,
            booking_state: "PAYMENT_REVIEW",
            camera_name: "Camera",
            currency: "PHP",
            declared_amount: 6000,
            proof: null,
            recipient_account: "09171234567",
            recipient_name: "Recipient",
            reference: "REFERENCE",
            rental_amount: 2000,
            renter_legal_name: "Renter",
            security_deposit: 4000,
            sender_name: "Renter",
            submitted_at: "2026-08-16T00:00:00Z",
            total_due: 6000,
            transaction_id: PAYMENT_ID,
          },
          error: null,
        };
      }
      return {
        data: [
          {
            action: "submit_payment",
            actor_user_id: "71000000-0000-4000-8000-000000000003",
            audit_id: 1,
            occurred_at: "2026-08-16T00:00:00Z",
            operation_id: "71000000-0000-4000-8000-000000000004",
            outcome: "success",
            purpose: "manual GCash payment submission",
            transaction_id: PAYMENT_ID,
          },
        ],
        error: null,
      };
    });

    const loaded = await loadPaymentReviewDetail(api.context, PAYMENT_ID);

    expect(loaded.status).toBe("success");
    expect(api.rpc).toHaveBeenNthCalledWith(2, "get_payment_audit_history", {
      p_booking_id: BOOKING_ID,
    });
    expect(JSON.stringify(loaded)).not.toMatch(/object_path|sha256|signed_url/);
  });

  it("fails closed when split accounting is malformed", async () => {
    const api = contextWith(async () => ({
      data: { currency: "PHP", verified_revenue: 6000 },
      error: null,
    }));
    await expect(loadPaymentAccountingSummary(api.context)).resolves.toEqual({
      status: "error",
    });
  });
});
