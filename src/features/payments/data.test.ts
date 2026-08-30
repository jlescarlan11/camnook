import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPaymentReviewDetail } from "./data";

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

describe("payment data projections", () => {
  it("loads strict detail and booking-scoped audit through one snapshot RPC", async () => {
    const api = contextWith(async () => ({
      data: {
        detail: {
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
        audit: [
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
      },
      error: null,
    }));

    const loaded = await loadPaymentReviewDetail(api.context, PAYMENT_ID);

    expect(loaded.status).toBe("success");
    expect(api.rpc).toHaveBeenCalledTimes(1);
    expect(api.rpc).toHaveBeenCalledWith("get_admin_payment_review_context", {
      p_payment_id: PAYMENT_ID,
    });
    expect(JSON.stringify(loaded)).not.toMatch(/object_path|sha256|signed_url/);
  });

  it("preserves the database admin denial for the page redirect", async () => {
    const api = contextWith(async () => ({
      data: null,
      error: { code: "42501", message: "admin authorization required" },
    }));

    await expect(
      loadPaymentReviewDetail(api.context, PAYMENT_ID),
    ).resolves.toEqual({ status: "forbidden" });
  });

});
