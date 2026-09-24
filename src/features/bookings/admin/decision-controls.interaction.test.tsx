/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { rejectBooking } = vi.hoisted(() => ({ rejectBooking: vi.fn() }));

vi.mock("./actions", () => ({
  approveBooking: vi.fn(),
  rejectBooking,
}));

import { DecisionControls } from "./decision-controls";

it("announces a rejected booking reason while describing the textarea", async () => {
  rejectBooking.mockResolvedValue({
    action: "reject",
    fieldErrors: { reason: "Enter a 2–1,000 character rejection reason." },
    status: "error",
  });
  render(<DecisionControls bookingId="95000000-0000-4000-8000-000000000001" ready />);

  const reason = screen.getByRole("textbox", { name: "Rejection reason" });
  fireEvent.submit(screen.getByRole("button", { name: "Reject booking" }).closest("form")!);
  await waitFor(() => expect(rejectBooking).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Enter a 2–1,000 character rejection reason.");
  expect(error.getAttribute("role")).toBe("alert");
  expect(reason.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});
