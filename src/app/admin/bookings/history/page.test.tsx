/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requirePageAdmin: vi.fn() }));
vi.mock("@/features/bookings/admin/history-data", () => ({ loadBookingHistory: vi.fn() }));
vi.mock("@/features/portfolio/data", () => ({ loadAdminDashboardContext: vi.fn() }));

import { requirePageAdmin } from "@/lib/auth/require-admin";
import { loadBookingHistory } from "@/features/bookings/admin/history-data";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import BookingHistoryPage from "./page";
import OwnerBookingsPage from "../page";

beforeEach(() => {
  vi.mocked(requirePageAdmin).mockResolvedValue({ supabase: {} } as never);
  vi.mocked(loadBookingHistory).mockResolvedValue({ status: "success", bookings: [], hasNext: false });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("keeps history reachable even when current work queues fail to load", async () => {
  vi.mocked(loadAdminDashboardContext).mockResolvedValue({ operations: { status: "error" } } as never);
  render(await OwnerBookingsPage());
  expect(screen.getByRole("link", { name: "Booking history" }).getAttribute("href")).toBe("/admin/bookings/history");
});

it("requires owner authorization before reading any history", async () => {
  vi.mocked(requirePageAdmin).mockRejectedValue(new Error("Forbidden"));
  await expect(BookingHistoryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Forbidden");
  expect(loadBookingHistory).not.toHaveBeenCalled();
});

it("rejects invalid filters without querying or claiming no bookings exist", async () => {
  render(await BookingHistoryPage({ searchParams: Promise.resolve({ state: "INVALID" }) }));
  expect(loadBookingHistory).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toMatch(/filters/i);
  expect(screen.queryByText(/No bookings/)).toBeNull();
  expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/admin/bookings/history");
});

it("shows a recovery message for a read failure", async () => {
  vi.mocked(loadBookingHistory).mockResolvedValue({ status: "error" });
  render(await BookingHistoryPage({ searchParams: Promise.resolve({ renter: "Synthetic" }) }));
  expect(screen.getByRole("alert").textContent).toMatch(/could not be loaded/i);
  expect(screen.queryByText(/No bookings/)).toBeNull();
  expect(screen.getByRole("button", { name: "Apply filters" })).toBeTruthy();
});

it("links a cancelled booking to owner detail and keeps filters in pagination", async () => {
  const id = "95000000-0000-4000-8000-000000000001";
  vi.mocked(loadBookingHistory).mockResolvedValue({ status: "success", hasNext: true, bookings: [{
    id, state: "CANCELLED", pickup_at: "2026-09-28T01:00:00Z", return_at: "2026-09-29T01:00:00Z", requested_at: "2026-09-26T01:00:00Z",
    profiles: { legal_name: "Synthetic Renter" }, cameras: { name: "Test camera" },
  }] });
  render(await BookingHistoryPage({ searchParams: Promise.resolve({ renter: "Synthetic", state: "CANCELLED", page: "2" }) }));
  expect(screen.getByText("Cancelled", { selector: "span" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /Test camera/ }).getAttribute("href")).toBe(`/admin/bookings/${id}`);
  expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toContain("renter=Synthetic&state=CANCELLED&page=3");
  expect(screen.getByRole("link", { name: "Previous page" }).getAttribute("href")).toContain("renter=Synthetic&state=CANCELLED");
  expect((screen.getByRole("searchbox", { name: "Renter name" }) as HTMLInputElement).value).toBe("Synthetic");
});

it("makes an empty later page recoverable", async () => {
  render(await BookingHistoryPage({ searchParams: Promise.resolve({ page: "20" }) }));
  expect(screen.getByText(/No bookings on this page/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Previous page" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
});
