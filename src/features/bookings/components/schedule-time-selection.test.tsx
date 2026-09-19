/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { quote } = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("../actions/quote-booking", () => ({ quoteBooking: quote }));
vi.mock("../calendar", async (original) => ({ ...await original<typeof import("../calendar")>(), getManilaToday: () => "2099-08-01" }));
import { normalizeScheduleQuoteInputKey } from "../manila-time";
import { initialQuoteActionState } from "../form-state";
import { ScheduleQuoteForm } from "./schedule-quote-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("quotes the sole valid handoff time and requires a new choice when a later range has multiple times", async () => {
  quote.mockResolvedValue(initialQuoteActionState);
  render(<ScheduleQuoteForm cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[{ startsAt: "2099-08-24T08:00:00+08:00", endsAt: "2099-08-24T12:00:00+08:00" }]} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00", "17:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));
  expect(quote).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /August 26, 2099, available/ }));
  await waitFor(() => expect(quote).toHaveBeenCalledOnce());
  expect((quote.mock.calls[0][1] as FormData).get("handoffTime")).toBe("17:00");
  const time = screen.getByRole("combobox", { name: "Handoff time" }) as HTMLSelectElement;
  expect(time.value).toBe("17:00");
  await userEvent.click(screen.getByRole("button", { name: /August 27, 2099, available/ }));
  await userEvent.click(screen.getByRole("button", { name: /August 28, 2099, available/ }));
  expect(time.value).toBe("");
  expect(quote).toHaveBeenCalledOnce();
  await userEvent.selectOptions(time, "09:00");
  await waitFor(() => expect(quote).toHaveBeenCalledTimes(2));
  expect((quote.mock.calls[1][1] as FormData).get("handoffTime")).toBe("09:00");
});

it("opens a shared calendar, retains dates after close, and edits only the return endpoint", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  quote.mockImplementation(async (_state, data: FormData) => ({
    status: "success", submissionGeneration: Number(data.get("generation")),
    inputKey: normalizeScheduleQuoteInputKey({ camera: String(data.get("camera")), pickupDate: String(data.get("pickupDate")), returnDate: String(data.get("returnDate")), handoffTime: String(data.get("handoffTime")), policyVersion: String(data.get("policyVersion")) }),
    quote: { cameraId: String(data.get("camera")), currency: "PHP", billableDays: 2, dailyRate: 450, rentalAmount: 900, securityDeposit: 1000, totalDue: 1900, pickupAt: "2099-08-24T09:00:00+08:00", returnAt: "2099-08-26T09:00:00+08:00" },
  }));
  render(<ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[]} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00", "17:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Pickup date Choose date" }));
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));
  await userEvent.click(screen.getByRole("button", { name: /August 26, 2099, available/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: /Pickup date Aug 24, 2099/ })).toBeTruthy();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Handoff time" }), "09:00");
  await waitFor(() => expect(quote).toHaveBeenCalledOnce());
  const continuation = await screen.findByRole("link", { name: "Continue to checkout" });
  const destination = new URL(continuation.getAttribute("href")!, "https://camnook.test");
  expect(destination.pathname).toBe("/checkout");
  expect(Object.fromEntries(destination.searchParams)).toEqual({ camera: "11111111-1111-4111-8111-111111111111", pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" });
  expect(continuation.getAttribute("href")).toContain("pickupDate=2099-08-24");
  expect(continuation.getAttribute("href")).toContain("returnDate=2099-08-26");
  await userEvent.click(screen.getByRole("button", { name: /Return date Aug 26, 2099/ }));
  await userEvent.click(screen.getByRole("button", { name: /August 28, 2099, available/ }));
  expect(screen.getByRole("button", { name: /Pickup date Aug 24, 2099/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Return date Aug 28, 2099/ })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "Handoff time" }) as HTMLSelectElement).value).toBe("");
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
});
