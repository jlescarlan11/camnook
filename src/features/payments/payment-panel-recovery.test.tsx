// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ submitPayment: vi.fn(), uploadPaymentProof: vi.fn() }));
import { submitPayment, uploadPaymentProof } from "./actions";
import { PaymentPanel } from "./payment-panel";
import type { PaymentState } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const payment: PaymentState = {
  approval_deadline_at: "2099-09-22T00:00:00Z",
  booking_id: "74000000-0000-4000-8000-000000000001", booking_state: "TO_PAY", can_submit: true,
  instructions: { currency: "PHP", recipient_account: "09170000000", recipient_config_version: 1, recipient_name: "Synthetic Recipient", rental_amount: 2000, security_deposit: 4000, total_due: 6000 },
  instructions_error: null,
  proof_policy: { allowed_media_types: ["image/jpeg", "image/png"], max_byte_size: 5 * 1024 * 1024, upload_intent_seconds: 900 },
  transaction: null,
};
const attemptId = "74000000-0000-4000-8000-000000000002";
const transaction: NonNullable<PaymentState["transaction"]> = {
  id: "74000000-0000-4000-8000-000000000003", status: "submitted", proof_exists: true,
  rejection_reason_code: null, submitted_at: "2026-09-22T00:00:00Z",
};

it("announces the latest proof failure as an error and a later submission as success", async () => {
  vi.mocked(submitPayment).mockResolvedValue({ status: "success" });
  vi.mocked(uploadPaymentProof).mockResolvedValue({ status: "error", error: "invalid" });
  const view = render(<PaymentPanel attemptId={attemptId} payment={payment} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("GCash reference"), "SYNTHETIC-001");
  const photo = new File(["synthetic"], "proof.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText("Transfer proof"), photo);
  // jsdom's native file validity does not observe user-event's selected FileList.
  fireEvent.submit(screen.getByRole("button", { name: "Submit payment for review" }).closest("form")!);
  await screen.findByText("Payment details were accepted for reconciliation. The original deadline remains unchanged.");
  view.rerender(<PaymentPanel attemptId={attemptId} payment={{ ...payment, can_submit: false, booking_state: "PAYMENT_REVIEW", transaction }} />);
  await user.upload(screen.getByLabelText("Transfer proof"), photo);
  fireEvent.submit(screen.getByRole("button", { name: "Save corrected proof" }).closest("form")!);
  const error = await screen.findByText("Check the payment fields and proof file, then try again.");
  expect(error.getAttribute("role")).toBe("alert");
  expect(error.className).toContain("border-red-200");
  expect(error.className).not.toContain("border-emerald-200");

  view.rerender(<PaymentPanel attemptId="74000000-0000-4000-8000-000000000012" payment={{ ...payment, transaction: { ...transaction, status: "rejected", rejection_reason_code: "not_found_in_gcash" } }} />);
  await user.type(screen.getByLabelText("GCash reference"), "SYNTHETIC-002");
  await user.upload(screen.getByLabelText("Transfer proof"), photo);
  fireEvent.submit(screen.getByRole("button", { name: "Submit payment for review" }).closest("form")!);
  await waitFor(() => expect(submitPayment).toHaveBeenCalledTimes(2));
  const success = await screen.findByText("Payment details were accepted for reconciliation. The original deadline remains unchanged.");
  expect(success.getAttribute("role")).toBe("status");
  expect(screen.queryByText("Check the payment fields and proof file, then try again.")).toBeNull();
});
