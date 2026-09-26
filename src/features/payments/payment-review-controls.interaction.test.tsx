/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { decidePayment } = vi.hoisted(() => ({ decidePayment: vi.fn() }));
vi.mock("./admin-actions", () => ({
  decidePayment,
  requestPaymentProofAccess: vi.fn(),
}));

import { PaymentReviewControls } from "./payment-review-controls";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("identifies payment-review controls after server validation rejects the decision", async () => {
  decidePayment.mockResolvedValue({
    action: "verify",
    error: "invalid",
    fieldErrors: {
      actualAccount: "Confirm the actual account.",
      observedAmount: "Enter the observed amount.",
      observedReference: "Enter the observed reference.",
    },
    status: "error",
  });
  render(<PaymentReviewControls hasProof paymentId="11111111-1111-4111-8111-111111111111" proofId="22222222-2222-4222-8222-222222222222" />);

  const amount = screen.getByLabelText("Amount observed in approved GCash account");
  const reference = screen.getByLabelText("Reference observed in approved GCash account");
  const actualAccount = screen.getByRole("checkbox", { name: /I checked the actual transfer/ });
  fireEvent.submit(screen.getByRole("button", { name: "Verify and confirm booking" }).closest("form")!);
  await waitFor(() => expect(decidePayment).toHaveBeenCalledTimes(1));

  for (const [control, message] of [
    [amount, "Enter the observed amount."],
    [reference, "Enter the observed reference."],
    [actualAccount, "Confirm the actual account."],
  ] as const) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});

it("identifies the rejection reason after server validation rejects it", async () => {
  decidePayment.mockResolvedValue({
    action: "reject",
    error: "invalid",
    fieldErrors: {
      rejectionReasonCode: "Choose a safe rejection reason.",
    },
    status: "error",
  });
  render(
    <PaymentReviewControls
      hasProof
      paymentId="11111111-1111-4111-8111-111111111111"
      proofId="22222222-2222-4222-8222-222222222222"
    />,
  );

  const reason = screen.getByLabelText("Rejection reason");
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Reject payment submission" })
      .closest("form")!,
  );
  await waitFor(() => expect(decidePayment).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Choose a safe rejection reason.");
  expect(reason.getAttribute("aria-invalid")).toBe("true");
  expect(reason.getAttribute("aria-describedby")).toContain(
    error.getAttribute("id"),
  );
});

it("keeps an invalid hidden payment reference actionable", async () => {
  decidePayment.mockResolvedValue({
    action: "verify",
    error: "invalid",
    fieldErrors: { paymentId: "Refresh this payment before reviewing it." },
    status: "error",
  });
  render(
    <PaymentReviewControls
      hasProof
      paymentId="11111111-1111-4111-8111-111111111111"
      proofId="22222222-2222-4222-8222-222222222222"
    />,
  );

  fireEvent.submit(
    screen.getByRole("button", { name: "Verify and confirm booking" }).closest("form")!,
  );
  await waitFor(() => expect(decidePayment).toHaveBeenCalledTimes(1));

  expect(await screen.findByText("Refresh this payment before reviewing it.")).toBeTruthy();
  expect(
    screen.queryByText(
      "The observed transfer did not match the authoritative amount or submitted reference.",
    ),
  ).toBeNull();
});
