// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: vi.fn() }));
import { requestBooking } from "@/features/bookings/actions/request-booking";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { testMeetupPlace } from "@/features/meetups/place-fixture.test-helper";
import { RequestForm } from "./request-form";

afterEach(cleanup);

it("keeps the meetup input labelled and submits only after reviewing the rental plans", async () => {
  vi.mocked(requestBooking).mockResolvedValue({ status: "error", error: "schedule_changed" });
  render(<RequestForm meetupPlaces={[testMeetupPlace]} checkoutHref="/checkout?camera=test" camera="test"
    profile={{ legalName: "Sample Renter", phone: "09170000000", defaultAddress: { areaName: "Cebu City", valid: true } }}
    schedule={{ handoffTime: "09:00", pickupDate: "2099-01-01", returnDate: "2099-01-03", policyVersion: "2" }}
    summary={{ cameraName: "Test camera", dates: "Jan 1–3", handoffTime: "9 AM", rentalAmount: "₱1,000", securityDeposit: "₱500", totalDue: "₱1,500" }} />);
  await userEvent.click(screen.getByRole("radio", { name: /Public mall entrance/ }));
  await userEvent.type(screen.getByLabelText("Purpose"), "Sample portrait shoot");
  await userEvent.type(screen.getByLabelText("Shooting city"), "Cebu City");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  expect(requestBooking).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Review" })).toBe(document.activeElement);
  await userEvent.click(screen.getByRole("button", { name: "Edit your details" }));
  expect((screen.getByLabelText("Purpose") as HTMLTextAreaElement).value).toBe("Sample portrait shoot");
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(requestBooking).toHaveBeenCalledTimes(1));
  expect(vi.mocked(requestBooking).mock.calls[0][1].get("policyVersion")).toBe("2");
  expect((await screen.findByRole("alert")).textContent).toContain("no longer available");
});
