// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addIssueNote: vi.fn(), decideCancellation: vi.fn(), decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(), recordReturn: vi.fn(), resolveIssue: vi.fn(), reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({ requestAdminConditionPhotoAccess: vi.fn(), uploadConditionPhoto: vi.fn() }));
import { recordReturn } from "./actions";
import { ResolutionControls, type ResolutionOperationIds } from "./resolution-controls";
import type { ResolutionDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["returned", "transport"])("preserves observed return damage and missing accessories across failure and refresh (%s)", async (failure) => {
  const action = vi.mocked(recordReturn);
  if (failure === "transport") action.mockRejectedValueOnce(new Error("Synthetic connection failure"));
  else action.mockResolvedValueOnce({ error: "indeterminate", status: "error" });
  action.mockResolvedValue({ result: "recorded", status: "success" });
  const ids: ResolutionOperationIds = {
    cancellation: "unused", conditionPhoto: "unused", issueNote: "unused", recordReturn: "94000000-0000-4000-8000-000000000013",
    refund: "unused", resolveIssue: "unused", returnReview: "unused", reversals: {},
  };
  const resolution = {
    booking_id: "94000000-0000-4000-8000-000000000001", booking_state: "ACTIVE",
    return_inspection: null, refunds: [], issue_notes: [], deposit: { held_amount: 4000 },
    expected_accessories: [{ id: "94000000-0000-4000-8000-000000000003", name: "Battery", quantity: 1 }],
  } as unknown as ResolutionDetail;
  const view = render(<ResolutionControls actualAt="2026-09-22T10:00:45" operationIds={ids} resolution={resolution} />);
  const user = userEvent.setup();
  const serial = screen.getByLabelText("Serial observed on the returned camera") as HTMLInputElement;
  const time = screen.getByLabelText("Actual return time (Asia/Manila)") as HTMLInputElement;
  const originalTime = time.value;
  await user.type(serial, "SYNTHETIC-SERIAL");
  await user.type(screen.getByLabelText("Return condition report"), "Synthetic camera has observed damage.");
  await user.type(screen.getByLabelText("Private notes (optional)"), "Synthetic inspection note.");
  await user.click(screen.getByLabelText("The camera itself has observed damage."));
  await user.selectOptions(screen.getByRole("combobox"), "missing");
  await user.click(screen.getByRole("button", { name: "Record return for review" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<ResolutionControls actualAt="2026-09-22T10:02:45" operationIds={{ ...ids, recordReturn: "94000000-0000-4000-8000-000000000014" }} resolution={resolution} />);
  expect((screen.getByLabelText("The camera itself has observed damage.") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("missing");
  expect(serial.value).toBe("SYNTHETIC-SERIAL");
  expect((screen.getByLabelText("Return condition report") as HTMLTextAreaElement).value).toBe("Synthetic camera has observed damage.");
  expect((screen.getByLabelText("Private notes (optional)") as HTMLTextAreaElement).value).toBe("Synthetic inspection note.");
  expect(time.value).toBe(originalTime);
  expect(new FormData(serial.form!).get("operationId")).toBe(ids.recordReturn);
  await user.click(screen.getByRole("button", { name: "Record return for review" }));
  await screen.findByText("The physical return was recorded and is awaiting review.");
  const retry = vi.mocked(recordReturn).mock.calls[1][1];
  expect(retry.get("cameraHasDamage")).toBe("yes");
  expect(retry.get("accessoryStatus-94000000-0000-4000-8000-000000000003")).toBe("missing");
  expect((screen.getByRole("button", { name: "Record return for review" }) as HTMLButtonElement).disabled).toBe(true);
});
