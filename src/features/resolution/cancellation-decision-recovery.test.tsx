// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(), recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn() }));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));
import { decideCancellation } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("preserves the cancellation decision reason and selected submitter on retry", async () => {
  vi.mocked(decideCancellation).mockResolvedValueOnce({ status: "error", error: "indeterminate" }).mockResolvedValue({ status: "success", result: "declined" });
  const ids: ResolutionOperationIds = { cancellation: "94000000-0000-4000-8000-000000000031", conditionPhoto: "unused", issueNote: "unused", recordReturn: "unused", refund: "unused", resolveIssue: "unused", returnReview: "unused", reversals: {} };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "FOR_REVIEW",
    cancellation: { request_id: "94000000-0000-4000-8000-000000000003", reason: "Synthetic request.", requested_at: "2026-09-22T02:00:00Z", acceptance_enabled: true, decision: null },
    return_inspection: null,
    refunds: [], issue_notes: [], deposit: { held_amount: 4000 },
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:00" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  const note = screen.getByLabelText("Decision reason") as HTMLTextAreaElement;
  await user.type(note, "Synthetic cancellation decision reason.");
  await user.click(screen.getByRole("button", { name: "Decline request" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:00" operationIds={{ ...ids, cancellation: "94000000-0000-4000-8000-000000000032" }} resolution={resolution} />);
  expect(note.value).toBe("Synthetic cancellation decision reason.");
  expect(new FormData(note.form!).get("operationId")).toBe(ids.cancellation);
  await user.click(screen.getByRole("button", { name: "Decline request" }));
  await screen.findByText("Cancellation declined with an immutable decision.");
  expect(vi.mocked(decideCancellation).mock.calls[0][1].get("decision")).toBe("decline");
  expect(Object.fromEntries(vi.mocked(decideCancellation).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(decideCancellation).mock.calls[0][1]));
  expect((screen.getByRole("button", { name: "Decline request" }) as HTMLButtonElement).disabled).toBe(true);
});
