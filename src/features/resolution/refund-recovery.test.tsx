// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));

import { recordExternalRefund, reverseExternalRefund } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["returned", "transport"])("preserves reversal facts after a %s failure and disables confirmed resubmission", async (failure) => {
  const action = vi.mocked(reverseExternalRefund);
  if (failure === "transport") action.mockRejectedValueOnce(new Error("Synthetic connection failure"));
  else action.mockResolvedValueOnce({ error: "indeterminate", status: "error" });
  action.mockResolvedValue({ result: "reversed", status: "success" });
  const refundId = "94000000-0000-4000-8000-000000000030";
  const operationId = "94000000-0000-4000-8000-000000000031";
  const ids: ResolutionOperationIds = {
    cancellation: "unused", conditionPhoto: "unused", issueNote: "unused",
    recordReturn: "unused", refund: "unused", resolveIssue: "unused", returnReview: "unused",
    reversals: { [refundId]: operationId },
  };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "COMPLETED",
    return_inspection: null, issue_notes: [], deposit: {
      held_amount: 4000, deduction_amount: 0, refunded_amount: 4000, remaining_refund_liability: 0,
    },
    refunds: [{ refund_record_id: refundId, entry_kind: "refund", amount: 4000,
      reference_last4: "0001", external_moved_at: "2026-09-22T01:00:00Z" }],
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:45" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Record correction as reversal"));
  const reference = screen.getByLabelText("Incoming reversal reference") as HTMLInputElement;
  const counterparty = screen.getByLabelText("Counterparty name") as HTMLInputElement;
  const reason = screen.getByLabelText("Correction reason") as HTMLInputElement;
  const movedAt = screen.getByLabelText("Actual reversal time (Asia/Manila)") as HTMLInputElement;
  const originalMovedAt = movedAt.value;
  await user.type(reference, "SYNTHETIC-REVERSAL-001");
  await user.type(counterparty, "Synthetic Renter");
  await user.type(reason, "Synthetic transfer was returned.");
  await user.click(screen.getByRole("button", { name: "Append offsetting reversal" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:15" operationIds={{ ...ids, reversals: { [refundId]: "94000000-0000-4000-8000-000000000032" } }} resolution={resolution} />);
  expect(reference.value).toBe("SYNTHETIC-REVERSAL-001");
  expect(counterparty.value).toBe("Synthetic Renter");
  expect(reason.value).toBe("Synthetic transfer was returned.");
  expect(movedAt.value).toBe(originalMovedAt);
  expect(new FormData(reference.form!).get("operationId")).toBe(operationId);
  await user.click(screen.getByRole("button", { name: "Append offsetting reversal" }));
  await screen.findByText("An offsetting reversal was recorded; the original refund was not edited.");
  expect(vi.mocked(reverseExternalRefund).mock.calls[1][1].get("refundRecordId")).toBe(refundId);
  expect((screen.getByRole("button", { name: "Append offsetting reversal" }) as HTMLButtonElement).disabled).toBe(true);
});

it.each(["returned", "transport"])("retains exact refund facts and identity after a %s failure and revalidation", async (failure) => {
  const action = vi.mocked(recordExternalRefund);
  if (failure === "transport") action.mockRejectedValueOnce(new Error("Synthetic connection failure"));
  else action.mockResolvedValueOnce({ error: "indeterminate", status: "error" });
  action.mockResolvedValue({ result: "refund_recorded", status: "success" });
  const ids: ResolutionOperationIds = {
    cancellation: "unused", conditionPhoto: "unused", issueNote: "unused",
    recordReturn: "unused", refund: "94000000-0000-4000-8000-000000000014",
    resolveIssue: "unused", returnReview: "unused", reversals: {},
  };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "COMPLETED",
    return_inspection: null, refunds: [], issue_notes: [], deposit: {
      held_amount: 4000, deduction_amount: 0, refunded_amount: 0, remaining_refund_liability: 4000,
    },
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:45" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  const amount = screen.getByLabelText("Actual amount moved (PHP)") as HTMLInputElement;
  const reference = screen.getByLabelText("Outgoing GCash reference") as HTMLInputElement;
  const recipient = screen.getByLabelText("Recipient name") as HTMLInputElement;
  const movedAt = screen.getByLabelText("Actual movement time (Asia/Manila)") as HTMLInputElement;
  const originalMovedAt = movedAt.value;
  await user.clear(amount);
  await user.type(amount, "1000");
  await user.type(reference, "SYNTHETIC-REFUND-001");
  await user.type(recipient, "Synthetic Renter");
  await user.click(screen.getByRole("button", { name: "Record completed external refund" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:15" operationIds={{ ...ids, refund: "94000000-0000-4000-8000-000000000024" }} resolution={{ ...resolution, deposit: { ...resolution.deposit, remaining_refund_liability: 3000, refunded_amount: 1000 } }} />);
  expect(amount.value).toBe("1000");
  expect(reference.value).toBe("SYNTHETIC-REFUND-001");
  expect(recipient.value).toBe("Synthetic Renter");
  expect(movedAt.value).toBe(originalMovedAt);
  expect(new FormData(amount.form!).get("operationId")).toBe(ids.refund);
  await user.click(screen.getByRole("button", { name: "Record completed external refund" }));
  await screen.findByText("The completed external refund movement was recorded.");
  expect(vi.mocked(recordExternalRefund).mock.calls[1][1].get("operationId")).toBe(ids.refund);
  expect(reference.value).toBe("");
  expect(amount.value).toBe("");
  expect(new FormData(amount.form!).get("operationId")).not.toBe(ids.refund);
});
