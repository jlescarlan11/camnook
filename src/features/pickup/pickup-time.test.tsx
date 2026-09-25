// @vitest-environment jsdom
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requirePageUser: vi.fn() }));
vi.mock("@/features/bookings/admin/data", () => ({ loadAdminBookingPageContext: vi.fn() }));

import AdminBookingPage from "@/app/admin/bookings/[bookingId]/page";
import { loadAdminBookingPageContext } from "@/features/bookings/admin/data";
import { parseManilaWallClock } from "@/features/bookings/manila-time";
import { PickupControls } from "./pickup-controls";

function findPickup(node: ReactNode): ReactElement<ComponentProps<typeof PickupControls>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === PickupControls) return child as ReactElement<ComponentProps<typeof PickupControls>>;
    const nested = findPickup(child.props.children);
    if (nested) return nested;
  }
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

it("keeps pickup time after a confirmation in the same minute and allows second-level correction", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-22T02:00:45Z"));
  vi.mocked(loadAdminBookingPageContext).mockResolvedValue({
    contractData: null, resolutionData: null,
    result: { status: "success", booking: {
      state: "CONFIRMED", pickupAt: "2026-09-22T02:00:00Z", returnAt: "2026-09-23T02:00:00Z",
      requestedAt: "2026-09-21T02:00:00Z", accessories: [], availability: [],
    } },
    pickupData: { status: "success", pickup: {
      booking_id: "84000000-0000-4000-8000-000000000001", booking_state: "CONFIRMED",
      accessories: [], renter_legal_name: "Synthetic Renter", eligibility: { eligible: true },
    } },
  } as never);
  const page = await AdminBookingPage({ params: Promise.resolve({ bookingId: "84000000-0000-4000-8000-000000000001" }) });
  const control = findPickup(page);
  expect(control).toBeDefined();
  const parsed = parseManilaWallClock(control!.props.actualAt);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("Pickup time must parse");
  expect(Date.parse(parsed.instant)).toBeGreaterThan(Date.parse("2026-09-22T02:00:30Z"));
  render(control!);
  const time = screen.getByLabelText("Actual pickup time (Asia/Manila)") as HTMLInputElement;
  fireEvent.change(time, { target: { value: "2026-09-22T10:00:46" } });
  expect(time.validity.stepMismatch).toBe(false);
});
