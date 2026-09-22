// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ completePickup: vi.fn(), uploadConditionPhoto: vi.fn(), requestAdminConditionPhotoAccess: vi.fn() }));
vi.mock("@/features/resolution/actions", () => ({ addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(), recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn() }));
import { uploadConditionPhoto } from "./actions";
import { PickupControls } from "./pickup-controls";
import type { PickupDetail } from "./types";
import { ResolutionControls, type ResolutionOperationIds } from "@/features/resolution/resolution-controls";
import type { ResolutionDetail } from "@/features/resolution/types";

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });
const bookingId = "84000000-0000-4000-8000-000000000001";
const reportId = "84000000-0000-4000-8000-000000000002";
const attemptId = "84000000-0000-4000-8000-000000000003";
const refreshedId = "84000000-0000-4000-8000-000000000004";

it.each((["pickup", "return", "replacement"] as const).flatMap((kind) => [[kind, "response"], [kind, "transport"]] as const))("retains %s photo selection and retry identity after %s uncertainty", async (kind, failure) => {
  const reset = vi.spyOn(HTMLFormElement.prototype, "reset");
  if (failure === "transport") vi.mocked(uploadConditionPhoto).mockRejectedValueOnce(new Error("synthetic transport interruption"));
  else vi.mocked(uploadConditionPhoto).mockResolvedValueOnce({ status: "error", error: "indeterminate" });
  vi.mocked(uploadConditionPhoto).mockResolvedValueOnce({ status: "error", error: "invalid" })
    .mockResolvedValueOnce({ status: "error", error: "unavailable" })
    .mockResolvedValue({ status: "success", result: "saved" });
  function control(intentId: string) {
    if (kind === "pickup") return <PickupControls actualAt="2026-09-22T10:00:00" operationId={attemptId} photoIntentId={intentId} pickup={{ booking_id: bookingId, booking_state: "ACTIVE", handoff: { condition_report_id: reportId, actual_at: "2026-09-22T02:00:00Z", condition_summary: "Synthetic condition", photos: [] } } as unknown as PickupDetail} />;
    const operationIds: ResolutionOperationIds = { cancellation: attemptId, conditionPhoto: intentId, issueNote: attemptId, recordReturn: attemptId, refund: attemptId, resolveIssue: attemptId, returnReview: attemptId, reversals: {} };
    const resolution = { booking_id: bookingId, booking_state: "RETURN_REVIEW", issue_notes: [], refunds: [], deposit: { held_amount: 0 }, return_inspection: { condition_report_id: reportId, actual_at: "2026-09-22T02:00:00Z", expected_return_at: "2026-09-22T02:00:00Z", accessories: [], photos: kind === "replacement" ? [{ photo_id: "84000000-0000-4000-8000-000000000005", byte_size: 9, supersedes_photo_id: null }] : [] } } as unknown as ResolutionDetail;
    return <ResolutionControls actualAt="2026-09-22T10:00:00" operationIds={operationIds} resolution={resolution} />;
  }
  const view = render(control(attemptId));
  const user = userEvent.setup();
  if (kind === "replacement") await user.click(screen.getByText("Replace with a new version"));
  const buttonName = kind === "pickup" ? "Attach private photo" : kind === "return" ? "Attach verified return photo" : "Upload versioned replacement";
  const button = screen.getByRole("button", { name: buttonName }) as HTMLButtonElement;
  const input = button.form!.querySelector('input[type="file"]') as HTMLInputElement;
  const photo = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], "synthetic-condition.png", { type: "image/png" });
  await user.upload(input, photo);
  fireEvent.submit(button.form!);
  await screen.findByRole("alert");
  view.rerender(control(refreshedId));
  expect(new FormData(input.form!).get("intentId")).toBe(attemptId);
  expect(input.files?.[0]?.name).toBe(photo.name);
  expect(reset).not.toHaveBeenCalled();
  fireEvent.submit(button.form!);
  await screen.findByRole("alert");
  expect(vi.mocked(uploadConditionPhoto).mock.calls[1][1].get("intentId")).toBe(attemptId);
  expect(new FormData(input.form!).get("intentId")).toBe(attemptId);
  fireEvent.submit(button.form!);
  await vi.waitFor(() => expect(vi.mocked(uploadConditionPhoto).mock.calls).toHaveLength(3));
  expect(vi.mocked(uploadConditionPhoto).mock.calls[2][1].get("intentId")).toBe(attemptId);
  // jsdom does not serialize user-event's FileList or clear it on form.reset.
  // Verify native reset timing and the selected file separately.
  await vi.waitFor(() => expect(new FormData(input.form!).get("intentId")).toBe(refreshedId));
  expect(reset).not.toHaveBeenCalled();
  fireEvent.submit(button.form!);
  await screen.findByRole("status");
  expect(reset).toHaveBeenCalledTimes(1);
  expect(vi.mocked(uploadConditionPhoto).mock.calls[3][1].get("intentId")).toBe(refreshedId);
});
