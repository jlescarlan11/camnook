/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const { cancel } = vi.hoisted(() => ({ cancel: vi.fn() }));
vi.mock("./actions", () => ({ requestCancellation: cancel }));
vi.mock("@/features/pickup/actions", () => ({ requestMyConditionPhotoAccess: vi.fn() }));
import { RenterResolutionStatus } from "./renter-resolution-status";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("preserves the cancellation reason and identity when retrying a failed request", async () => {
  const submissions: Record<string, FormDataEntryValue>[] = [];
  cancel.mockImplementation(async (_state, data: FormData) => {
    submissions.push(Object.fromEntries(data));
    return { status: "error", error: "indeterminate" };
  });
  const view = render(<RenterResolutionStatus operationId="22222222-2222-4222-8222-222222222222" resolution={{ booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "FOR_REVIEW", can_request_cancellation: true, cancellation: null, deposit: { deduction_amount: 0, held_amount: 0, refunded_amount: 0, remaining_refund_liability: 0, status: "none" }, issue_decision: null, return_inspection: null }} />);
  const reason = screen.getByRole("textbox", { name: "Why are you requesting cancellation?" }) as HTMLTextAreaElement;
  await userEvent.type(reason, "The event moved to another date.");
  await userEvent.click(screen.getByRole("button", { name: "Request cancellation" }));
  await screen.findByRole("alert");
  expect(reason.value).toBe("The event moved to another date.");
  view.rerender(<RenterResolutionStatus operationId="33333333-3333-4333-8333-333333333333" resolution={{ booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "FOR_REVIEW", can_request_cancellation: true, cancellation: null, deposit: { deduction_amount: 0, held_amount: 0, refunded_amount: 0, remaining_refund_liability: 0, status: "none" }, issue_decision: null, return_inspection: null }} />);
  await userEvent.click(screen.getByRole("button", { name: "Request cancellation" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toEqual(submissions[0]);
  expect(submissions[1]).toMatchObject({ reason: "The event moved to another date.", bookingId: "11111111-1111-4111-8111-111111111111", operationId: "22222222-2222-4222-8222-222222222222" });
  view.rerender(<RenterResolutionStatus operationId="33333333-3333-4333-8333-333333333333" resolution={{ booking_id: "44444444-4444-4444-8444-444444444444", booking_state: "FOR_REVIEW", can_request_cancellation: true, cancellation: null, deposit: { deduction_amount: 0, held_amount: 0, refunded_amount: 0, remaining_refund_liability: 0, status: "none" }, issue_decision: null, return_inspection: null }} />);
  const otherReason = screen.getByRole("textbox", { name: "Why are you requesting cancellation?" }) as HTMLTextAreaElement;
  expect(otherReason.value).toBe("");
  expect(new FormData(otherReason.form!).get("operationId")).toBe("33333333-3333-4333-8333-333333333333");

});

it("identifies the cancellation reason after server validation rejects it", async () => {
  cancel.mockResolvedValue({
    error: "invalid",
    fieldErrors: { reason: "Enter a 2–1,000 character cancellation reason." },
    status: "error",
  });
  render(<RenterResolutionStatus operationId="22222222-2222-4222-8222-222222222222" resolution={{ booking_id: "11111111-1111-4111-8111-111111111111", booking_state: "FOR_REVIEW", can_request_cancellation: true, cancellation: null, deposit: { deduction_amount: 0, held_amount: 0, refunded_amount: 0, remaining_refund_liability: 0, status: "none" }, issue_decision: null, return_inspection: null }} />);

  const reason = screen.getByRole("textbox", { name: "Why are you requesting cancellation?" });
  fireEvent.submit(screen.getByRole("button", { name: "Request cancellation" }).closest("form")!);
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Enter a 2–1,000 character cancellation reason.");
  expect(reason.getAttribute("aria-invalid")).toBe("true");
  expect(reason.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  expect(screen.queryByText("The cancellation request could not be confirmed.")).toBeNull();
});
