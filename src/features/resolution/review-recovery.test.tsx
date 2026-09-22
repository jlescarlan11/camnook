// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(), recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn() }));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));
import { decideReturnReview } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("preserves the return review note and retry identity after an uncertain result", async () => {
  vi.mocked(decideReturnReview).mockResolvedValueOnce({ status: "error", error: "indeterminate" }).mockResolvedValue({ status: "success", result: "returned_clear" });
  const ids: ResolutionOperationIds = { cancellation: "unused", conditionPhoto: "unused", issueNote: "unused", recordReturn: "unused", refund: "unused", resolveIssue: "unused", returnReview: "94000000-0000-4000-8000-000000000031", reversals: {} };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "RETURN_REVIEW",
    return_inspection: { actual_at: "2026-09-22T02:00:00Z", expected_return_at: "2026-09-22T03:00:00Z", late_return: false, camera_has_damage: false, has_missing_items: false, camera_condition_summary: "Synthetic clear return.", accessories: [], photos: [] },
    refunds: [], issue_notes: [], deposit: { held_amount: 4000 },
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:00" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  const note = screen.getByLabelText("Review note (optional)") as HTMLTextAreaElement;
  await user.type(note, "Synthetic review of returned equipment.");
  await user.click(screen.getByRole("button", { name: "Clear return and complete" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:00" operationIds={{ ...ids, returnReview: "94000000-0000-4000-8000-000000000032" }} resolution={resolution} />);
  expect(note.value).toBe("Synthetic review of returned equipment.");
  expect(new FormData(note.form!).get("operationId")).toBe(ids.returnReview);
  await user.click(screen.getByRole("button", { name: "Clear return and complete" }));
  await screen.findByText("The clear return was completed with no deduction.");
  expect(Object.fromEntries(vi.mocked(decideReturnReview).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(decideReturnReview).mock.calls[0][1]));
  expect((screen.getByRole("button", { name: "Clear return and complete" }) as HTMLButtonElement).disabled).toBe(true);
});
