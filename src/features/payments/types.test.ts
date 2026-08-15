import { describe, expect, it } from "vitest";

import {
  paymentAccountingSummarySchema,
  paymentReviewQueueSchema,
  paymentStateSchema,
} from "./types";

const BOOKING_ID = "70000000-0000-4000-8000-000000000001";

describe("payment projection schemas", () => {
  it("accepts authoritative owner state and rejects leaked private proof data", () => {
    const state = {
      approval_deadline_at: "2026-08-17T00:00:00Z",
      booking_id: BOOKING_ID,
      booking_state: "TO_PAY",
      can_submit: true,
      instructions: {
        currency: "PHP",
        recipient_account: "09171234567",
        recipient_config_version: 1,
        recipient_name: "Approved Recipient",
        rental_amount: 2000,
        security_deposit: 4000,
        total_due: 6000,
      },
      instructions_error: null,
      proof_policy: {
        allowed_media_types: ["image/jpeg", "image/png"],
        max_byte_size: 5 * 1024 * 1024,
        upload_intent_seconds: 900,
      },
      transaction: null,
    };

    expect(paymentStateSchema.safeParse(state).success).toBe(true);
    expect(
      paymentStateSchema.safeParse({ ...state, object_path: "private/path" })
        .success,
    ).toBe(false);
  });

  it("keeps queue and accounting contracts strict and separates deposits", () => {
    const queue = [
      {
        age_seconds: 43_201,
        approval_deadline_at: "2026-08-17T00:00:00Z",
        booking_id: BOOKING_ID,
        camera_name: "Camera",
        currency: "PHP",
        declared_amount: 6000,
        proof_exists: true,
        reference: "GCASH-REFERENCE",
        renter_legal_name: "Renter",
        sender_name: "Renter",
        submitted_at: "2026-08-16T00:00:00Z",
        transaction_id: "70000000-0000-4000-8000-000000000002",
      },
    ];
    expect(paymentReviewQueueSchema.safeParse(queue).success).toBe(true);
    expect(
      paymentReviewQueueSchema.safeParse([
        { ...queue[0], sha256: "sensitive-digest" },
      ]).success,
    ).toBe(false);
    expect(
      paymentAccountingSummarySchema.parse({
        currency: "PHP",
        security_deposit_liability: 4000,
        verified_rental_revenue: 2000,
      }),
    ).toMatchObject({
      security_deposit_liability: 4000,
      verified_rental_revenue: 2000,
    });
  });
});
