// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./admin-actions", () => ({
  decidePayment: vi.fn(),
  requestPaymentProofAccess: vi.fn(),
}));

import { decidePayment, requestPaymentProofAccess } from "./admin-actions";
import { PaymentReviewControls } from "./payment-review-controls";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("discards the old private link and transfer attestation when the current proof changes", async () => {
  vi.mocked(requestPaymentProofAccess).mockResolvedValue({
    status: "success", signedUrl: "https://example.invalid/synthetic-proof",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const props = { hasProof: true, paymentId: "74000000-0000-4000-8000-000000000003", proofId: "74000000-0000-4000-8000-000000000004" };
  const view = render(<PaymentReviewControls {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Open proof for 60 seconds" }));
  await screen.findByRole("link", { name: "View private proof in a new tab" });
  await userEvent.click(screen.getByRole("checkbox"));
  view.rerender(<PaymentReviewControls {...props} />);
  expect(screen.getByRole("link", { name: "View private proof in a new tab" })).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  view.rerender(<PaymentReviewControls {...props} proofId="74000000-0000-4000-8000-000000000005" />);
  expect(screen.queryByRole("link", { name: "View private proof in a new tab" })).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});

it("retains the rejection reason after an uncertain outcome", async () => {
  vi.mocked(decidePayment).mockResolvedValue({ action: "reject", error: "indeterminate", status: "error" });
  render(<PaymentReviewControls hasProof paymentId="74000000-0000-4000-8000-000000000003" />);
  const reason = screen.getByLabelText("Rejection reason") as HTMLSelectElement;
  const option = screen.getByRole("option", { name: "Transfer was not found in GCash" }) as HTMLOptionElement;
  await userEvent.selectOptions(reason, option.value);
  await userEvent.click(screen.getByRole("button", { name: "Reject payment submission" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  expect(reason.value).toBe(option.value);
});

it("preserves observed transfer details after a rejected validation and permits correction", async () => {
  vi.mocked(decidePayment)
    .mockResolvedValueOnce({ action: "verify", error: "invalid", status: "error" })
    .mockResolvedValueOnce({ action: "verify", bookingState: "CONFIRMED", status: "success" });
  render(<PaymentReviewControls hasProof paymentId="74000000-0000-4000-8000-000000000003" proofId="74000000-0000-4000-8000-000000000004" />);
  const user = userEvent.setup();
  const amount = screen.getByLabelText("Amount observed in approved GCash account") as HTMLInputElement;
  const reference = screen.getByLabelText("Reference observed in approved GCash account") as HTMLInputElement;
  await user.type(amount, "6001");
  await user.type(reference, "SYNTHETIC-REFERENCE");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Verify and confirm booking" }));
  await screen.findByText("The observed transfer did not match the authoritative amount or submitted reference.");
  expect(amount.value).toBe("6001");
  expect(reference.value).toBe("SYNTHETIC-REFERENCE");
  await user.clear(amount);
  await user.type(amount, "6000");
  await user.click(screen.getByRole("button", { name: "Verify and confirm booking" }));
  await screen.findByText("The transfer was reconciled and the booking is confirmed.");
  expect(vi.mocked(decidePayment).mock.calls[1][1].get("observedAmount")).toBe("6000");
  expect((screen.getByRole("button", { name: "Verify and confirm booking" }) as HTMLButtonElement).disabled).toBe(true);
});
