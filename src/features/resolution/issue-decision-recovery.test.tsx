// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(), recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn() }));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));
import { resolveIssue } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["returned", "transport"])("preserves the explicit deduction and decision reasons through an uncertain result (%s)", async (failure) => {
  const action = vi.mocked(resolveIssue);
  if (failure === "transport") action.mockRejectedValueOnce(new Error("Synthetic connection failure"));
  else action.mockResolvedValueOnce({ error: "indeterminate", status: "error" });
  action.mockResolvedValue({ result: "resolved", status: "success" });
  const ids: ResolutionOperationIds = { cancellation: "unused", conditionPhoto: "unused", issueNote: "unused", recordReturn: "unused", refund: "unused", resolveIssue: "94000000-0000-4000-8000-000000000021", returnReview: "unused", reversals: {} };
  const resolution = { booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "ISSUE_REVIEW", return_inspection: null, refunds: [], issue_notes: [], deposit: { held_amount: 4000 } } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:00" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  const amount = screen.getByLabelText("Manual deduction amount (PHP)") as HTMLInputElement;
  await user.clear(amount);
  await user.type(amount, "1000");
  await user.selectOptions(screen.getByLabelText("Decision kind"), "other");
  await user.type(screen.getByLabelText("Private internal reason and evidence basis"), "Synthetic documented repair decision.");
  await user.type(screen.getByLabelText("Renter-visible explanation"), "Synthetic explanation of the 1000 PHP deduction.");
  await user.click(screen.getByRole("button", { name: "Record decision and complete booking" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:00" operationIds={{ ...ids, resolveIssue: "94000000-0000-4000-8000-000000000022" }} resolution={resolution} />);
  expect(amount.value).toBe("1000");
  expect((screen.getByLabelText("Decision kind") as HTMLSelectElement).value).toBe("other");
  expect((screen.getByLabelText("Private internal reason and evidence basis") as HTMLTextAreaElement).value).toBe("Synthetic documented repair decision.");
  expect((screen.getByLabelText("Renter-visible explanation") as HTMLTextAreaElement).value).toBe("Synthetic explanation of the 1000 PHP deduction.");
  expect(new FormData(amount.form!).get("operationId")).toBe(ids.resolveIssue);
  await user.click(screen.getByRole("button", { name: "Record decision and complete booking" }));
  await screen.findByText("The issue decision and any deduction were recorded; the booking is complete.");
  expect(Object.fromEntries(vi.mocked(resolveIssue).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(resolveIssue).mock.calls[0][1]));
  expect((screen.getByRole("button", { name: "Record decision and complete booking" }) as HTMLButtonElement).disabled).toBe(true);
});
