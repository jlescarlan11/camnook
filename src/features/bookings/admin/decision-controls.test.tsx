// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ approveBooking: vi.fn(), rejectBooking: vi.fn() }));
import { approveBooking, rejectBooking } from "./actions";
import { DecisionControls } from "./decision-controls";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each(["approve", "reject"] as const)("keeps a lost %s response uncertain and permits an explicit retry", async (kind) => {
  const action = vi.mocked(kind === "approve" ? approveBooking : rejectBooking);
  let disconnect!: (error: Error) => void;
  action.mockImplementationOnce(() => new Promise((_resolve, reject) => { disconnect = reject; }))
    .mockResolvedValue({ action: kind, committed: true, status: "success" });
  render(<DecisionControls bookingId="95000000-0000-4000-8000-000000000001" ready />);
  const user = userEvent.setup();
  const reason = screen.getByLabelText("Rejection reason") as HTMLTextAreaElement;
  await user.type(reason, "Synthetic booking decision reason.");
  const approve = screen.getByRole("button", { name: "Approve booking" }) as HTMLButtonElement;
  const reject = screen.getByRole("button", { name: "Reject booking" }) as HTMLButtonElement;
  await user.click(kind === "approve" ? approve : reject);
  await waitFor(() => { expect(approve.disabled).toBe(true); expect(reject.disabled).toBe(true); });
  await act(async () => { disconnect(new Error("Synthetic private connection failure")); });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("The outcome is uncertain. Refresh to confirm the persisted state before retrying.");
  expect(document.activeElement).toBe(alert);
  expect(reason.value).toBe("Synthetic booking decision reason.");
  expect(action).toHaveBeenCalledOnce();
  await user.click(kind === "approve" ? approve : reject);
  await screen.findByText(kind === "approve"
    ? "Approval committed. Refreshing the persisted booking now."
    : "Rejection committed. Refreshing the persisted booking now.");
  expect(action).toHaveBeenCalledTimes(2);
  expect(Object.fromEntries(action.mock.calls[1][1])).toEqual(Object.fromEntries(action.mock.calls[0][1]));
  expect(kind === "approve" ? rejectBooking : approveBooking).not.toHaveBeenCalled();
});
