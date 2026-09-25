// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));

import { addIssueNote } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["returned", "transport"])("preserves a note and its operation reference after uncertainty and rotates only after success (%s)", async (failure) => {
  const action = vi.mocked(addIssueNote);
  if (failure === "transport") action.mockRejectedValueOnce(new Error("Synthetic connection failure"));
  else action.mockResolvedValueOnce({ error: "indeterminate", status: "error" });
  action.mockResolvedValue({ result: "note_saved", status: "success" });
  const ids: ResolutionOperationIds = {
    cancellation: "unused", conditionPhoto: "unused", issueNote: "94000000-0000-4000-8000-000000000012",
    recordReturn: "unused", refund: "unused", resolveIssue: "unused", returnReview: "unused", reversals: {},
  };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "ISSUE_REVIEW",
    return_inspection: null, refunds: [], issue_notes: [], deposit: { held_amount: 4000 },
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:45" operationIds={ids} resolution={resolution} />);
  const note = screen.getByLabelText("Private issue note") as HTMLTextAreaElement;
  const user = userEvent.setup();
  await user.type(note, "Synthetic inspection observation.");
  await user.click(screen.getByRole("button", { name: "Append private note" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  expect(note.value).toBe("Synthetic inspection observation.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:01:00" operationIds={{ ...ids, issueNote: "94000000-0000-4000-8000-000000000022" }} resolution={resolution} />);
  expect(new FormData(note.form!).get("operationId")).toBe(ids.issueNote);
  await user.click(screen.getByRole("button", { name: "Append private note" }));
  await screen.findByText("The private issue note was appended.");
  expect(vi.mocked(addIssueNote).mock.calls[1][1].get("operationId")).toBe(ids.issueNote);
  expect(note.value).toBe("");
  await user.type(note, "Another synthetic observation.");
  await user.click(screen.getByRole("button", { name: "Append private note" }));
  expect(vi.mocked(addIssueNote).mock.calls[2][1].get("operationId")).not.toBe(ids.issueNote);
  expect(vi.mocked(addIssueNote).mock.calls[2][1].get("note")).toBe("Another synthetic observation.");
});
