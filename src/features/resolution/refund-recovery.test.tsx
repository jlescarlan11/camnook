// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));

import { recordExternalRefund } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("retains exact refund facts and operation identity through uncertainty and revalidation", async () => {
  vi.mocked(recordExternalRefund)
    .mockResolvedValueOnce({ error: "indeterminate", status: "error" })
    .mockResolvedValue({ result: "refund_recorded", status: "success" });
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
