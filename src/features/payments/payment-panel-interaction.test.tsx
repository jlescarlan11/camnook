/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { submitPayment } = vi.hoisted(() => ({ submitPayment: vi.fn() }));
vi.mock("./actions", () => ({ submitPayment, uploadPaymentProof: vi.fn() }));

import { PaymentPanel } from "./payment-panel";
import type { PaymentState } from "./types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const payment: PaymentState = {
  approval_deadline_at: "2099-08-24T01:00:00Z",
  booking_id: "11111111-1111-4111-8111-111111111111",
  booking_state: "TO_PAY",
  can_submit: true,
  instructions: {
    currency: "PHP",
    recipient_account: "09171234567",
    recipient_config_version: 1,
    recipient_name: "CamNook Test",
    rental_amount: 900,
    security_deposit: 1000,
    total_due: 1900,
  },
  instructions_error: null,
  proof_policy: {
    allowed_media_types: ["image/jpeg", "image/png"],
    max_byte_size: 5 * 1024 * 1024,
    upload_intent_seconds: 900,
  },
  transaction: null,
};

it("identifies reference and proof controls after server validation rejects payment details", async () => {
  submitPayment.mockResolvedValue({
    error: "invalid",
    fieldErrors: { proof: "Choose a JPEG or PNG proof.", reference: "Enter the GCash reference." },
    status: "error",
  });
  render(<PaymentPanel attemptId="22222222-2222-4222-8222-222222222222" payment={payment} />);

  const reference = screen.getByLabelText("GCash reference");
  const proof = screen.getByLabelText("Transfer proof");
  fireEvent.submit(screen.getByRole("button", { name: "Submit payment for review" }).closest("form")!);
  await waitFor(() => expect(submitPayment).toHaveBeenCalledTimes(1));

  const referenceError = await screen.findByText("Enter the GCash reference.");
  const proofError = screen.getByText("Choose a JPEG or PNG proof.");
  expect(reference.getAttribute("aria-invalid")).toBe("true");
  expect(reference.getAttribute("aria-describedby")).toContain(referenceError.getAttribute("id"));
  expect(proof.getAttribute("aria-invalid")).toBe("true");
  expect(proof.getAttribute("aria-describedby")).toContain(proofError.getAttribute("id"));
});
