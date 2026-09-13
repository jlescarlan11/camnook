/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: action }));
import { RequestForm } from "./request-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("requires explicit confirmation and submits reviewed details, including edits", async () => {
  const submissions: Record<string, FormDataEntryValue>[] = [];
  action.mockImplementation(async (_state, data: FormData) => {
    submissions.push(Object.fromEntries(data));
    return { status: "error", error: "request_failed" };
  });
  render(<RequestForm camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "Test Renter", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} />);
  await userEvent.type(screen.getByRole("textbox", { name: /Preferred meetup area/ }), "IT Park");
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  // Enter in the last detail field must also stop at review.
  await userEvent.keyboard("{Enter}");
  expect(action).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review & request" }));
  await userEvent.click(screen.getByRole("button", { name: "Request rental" }));
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(screen.getByRole("link", { name: "Check your bookings" }).getAttribute("href")).toBe("/account");
  expect(submissions[0]).toMatchObject({
    legalName: "Test Renter", phone: "09170000000", preferredMeetupArea: "IT Park",
    intendedUse: "Portrait practice", expectedLocation: "Cebu City", pickupDate: "2099-08-24",
    returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1",
  });
  await userEvent.click(screen.getByRole("button", { name: "Edit your details" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your details" }));
  const purpose = screen.getByRole("textbox", { name: "Purpose" });
  await userEvent.clear(purpose);
  await userEvent.type(purpose, "Landscape practice");
  await userEvent.click(screen.getByRole("button", { name: "Continue to review" }));
  expect(submissions).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Request rental" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toMatchObject({ intendedUse: "Landscape practice", operationId: submissions[0].operationId });
});

it("opens the details step when validation rejects a field, preserving the draft for correction", async () => {
  action.mockResolvedValueOnce({ status: "error", error: "invalid_input", fieldErrors: { legalName: "Enter your name." } })
    .mockResolvedValue({ status: "error", error: "request_failed" });
  render(<RequestForm camera="11111111-1111-4111-8111-111111111111" profile={{ legalName: "A", phone: "09170000000" }} schedule={{ pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" }} summary={{ cameraName: "Test camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1,000", totalDue: "₱1,900" }} />);
  await userEvent.type(screen.getByRole("textbox", { name: /Preferred meetup area/ }), "IT Park");
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
  await userEvent.click(screen.getByRole("button", { name: "Continue to review" }));
  await userEvent.click(screen.getByRole("button", { name: "Request rental" }));
  await screen.findByRole("textbox", { name: /Name/ });
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your details" }));
  expect(screen.getByRole("alert").textContent).toBe("Enter your name.");
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLTextAreaElement).value).toBe("Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: /Name/ }), "lex");
  await userEvent.click(screen.getByRole("button", { name: "Continue to review" }));
  expect(action).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Request rental" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect((action.mock.calls[1][1] as FormData).get("legalName")).toBe("Alex");
});
