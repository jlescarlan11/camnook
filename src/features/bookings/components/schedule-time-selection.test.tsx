/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { quote } = vi.hoisted(() => ({ quote: vi.fn() }));
vi.mock("../actions/quote-booking", () => ({ quoteBooking: quote }));
vi.mock("../calendar", async (original) => ({ ...await original<typeof import("../calendar")>(), getManilaToday: () => "2099-08-01" }));
import { ScheduleQuoteForm } from "./schedule-quote-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each([
  { pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "12:00" },
  { pickupDate: "2099-08-26", returnDate: "2099-08-24", handoffTime: "09:00" },
  { pickupDate: "2020-08-24", returnDate: "2020-08-26", handoffTime: "09:00" },
])("blocks invalid restored selection $pickupDate / $returnDate / $handoffTime", (initialSchedule) => {
  render(<ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[]} initialSchedule={initialSchedule} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00", "17:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  expect((screen.getByRole("button", { name: "Continue to checkout" }) as HTMLButtonElement).disabled).toBe(true);
  expect(quote).not.toHaveBeenCalled();
});

it("blocks a restored range that crosses unavailable dates", () => {
  render(<ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[{startsAt:"2099-08-25T09:00:00+08:00",endsAt:"2099-08-25T17:00:00+08:00"}]} initialSchedule={{pickupDate:"2099-08-24",returnDate:"2099-08-26",handoffTime:"09:00"}} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("overlaps");
});

it("continues immediately with the sole valid time without quoting, and resets an edited range", async () => {
  render(<ScheduleQuoteForm cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[{ startsAt: "2099-08-24T08:00:00+08:00", endsAt: "2099-08-24T12:00:00+08:00" }]} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00", "17:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));
  expect(quote).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /August 26, 2099, available/ }));
  expect(screen.getByRole("link", { name: "Continue to checkout" }).getAttribute("href")).toContain("handoffTime=17%3A00");
  expect(quote).not.toHaveBeenCalled();
  const time = screen.getByRole("combobox", { name: "Handoff time" }) as HTMLSelectElement;
  expect(time.value).toBe("17:00");
  await userEvent.click(screen.getByRole("button", { name: /August 27, 2099, available/ }));
  await userEvent.click(screen.getByRole("button", { name: /August 28, 2099, available/ }));
  expect(time.value).toBe("");
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  await userEvent.selectOptions(time, "09:00");
  expect(screen.getByRole("link", { name: "Continue to checkout" }).getAttribute("href")).toContain("handoffTime=09%3A00");
  expect(quote).not.toHaveBeenCalled();
});

it("opens a shared calendar, retains dates after close, and edits only the return endpoint", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  render(<ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[]} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00", "17:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Pickup date Choose date" }));
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));
  await userEvent.click(screen.getByRole("button", { name: /August 26, 2099, available/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: /Pickup date Aug 24, 2099/ })).toBeTruthy();
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Handoff time" }), "09:00");
  expect(quote).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "Estimate" })).toBeNull();
  expect(screen.queryByText("Estimate ready.")).toBeNull();
  expect(screen.queryByText("Estimated total")).toBeNull();
  expect(screen.queryByText("Rental subtotal")).toBeNull();
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

it("keeps a selected pickup date as an action button", async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  render(<ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[]} policy={{ allowedWeekdays: [0, 1, 2, 3, 4, 5, 6], approvedTimes: ["09:00"], approximationLevel: "city_centroid", cityLabel: "Cebu City", enabled: true, timezone: "Asia/Manila", version: 1 }} />);

  await userEvent.click(screen.getByRole("button", { name: "Pickup date Choose date" }));
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));

  const selectedPickup = screen.getByRole("button", { name: /August 24, 2099, selected pickup/ });
  expect(selectedPickup.getAttribute("aria-pressed")).toBeNull();
});
