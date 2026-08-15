import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  submitPayment: vi.fn(),
  uploadPaymentProof: vi.fn(),
}));
vi.mock("./admin-actions", () => ({
  decidePayment: vi.fn(),
  requestPaymentProofAccess: vi.fn(),
}));

import { PaymentPanel } from "./payment-panel";
import { PaymentReviewControls } from "./payment-review-controls";
import type { PaymentState } from "./types";

const state: PaymentState = {
  approval_deadline_at: "2026-08-17T00:00:00Z",
  booking_id: "74000000-0000-4000-8000-000000000001",
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

describe("payment UI controls", () => {
  it("shows exact owner instructions, deadline, and optional proof policy", () => {
    const markup = renderToStaticMarkup(
      <PaymentPanel
        attemptId="74000000-0000-4000-8000-000000000002"
        payment={state}
      />,
    );

    for (const expected of [
      "Approved Recipient",
      "09171234567",
      "₱2,000.00",
      "₱4,000.00",
      "₱6,000.00",
      "Original payment deadline",
      "JPEG or PNG, maximum 5 MiB",
      "Submit payment for review",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).toContain('name="attemptId"');
    expect(markup).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("makes actual-account confirmation explicit and keeps rejection reasons constrained", () => {
    const markup = renderToStaticMarkup(
      <PaymentReviewControls
        hasProof
        paymentId="74000000-0000-4000-8000-000000000003"
      />,
    );

    expect(markup).toContain("Open proof for 60 seconds");
    expect(markup).toContain("screenshot is never sufficient");
    expect(markup).toContain('name="observedAmount"');
    expect(markup).toContain('name="observedReference"');
    expect(markup).toContain('name="actualAccount"');
    expect(markup).toContain("Transfer was not found in GCash");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toMatch(/object_path|sha256|signed_url/);
  });
});
