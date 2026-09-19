import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requirePageUser: vi.fn() }));
vi.mock("@/features/bookings/data/booking-request-page", () => ({ loadBookingRequestPageContext: vi.fn() }));
vi.mock("@/features/kyc/kyc-profile-form", () => ({ KycProfileForm: ({ returnTo }: { returnTo: string }) => <form data-kyc-return={returnTo} /> }));
vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

import { requirePageUser } from "@/lib/auth/require-user";
import { loadBookingRequestPageContext } from "@/features/bookings/data/booking-request-page";
import CheckoutPage from "./page";
import LegacyPage from "../account/bookings/new/page";
import LoadingCheckout from "./loading";

const selection = { camera: "11111111-1111-4111-8111-111111111111", pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "3" };
function context() {
  return {
    status: "success", camera: { id: selection.camera, name: "Test camera", slug: "test-camera" },
    profile: { accountStatus: "active", legalName: "Test Renter", phone: "09170000000" },
    kycProfile: { current: true, areaName: "Cebu City" },
    quote: { cameraId: selection.camera, currency: "PHP", billableDays: 2, dailyRate: 600, rentalAmount: 1200, securityDeposit: 1000, totalDue: 2200, pickupAt: "2099-08-24T01:00:00Z", returnAt: "2099-08-26T01:00:00Z" },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePageUser).mockResolvedValue({ user: { id: "renter" } } as never);
  vi.mocked(loadBookingRequestPageContext).mockResolvedValue(context() as never);
});

it("renders current server prices, review controls and camera edit selection, excluding browser totals", async () => {
  const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({ ...selection, totalDue: "0", next: "https://evil.test" }) }));
  expect(markup).toContain("Rental checkout");
  expect(markup).toContain("Rental summary");
  expect(markup).toContain("2,200.00");
  expect(markup).toContain("Estimated total");
  expect(markup).toContain("Estimate only—not reserved");
  expect(markup).toContain("Submit rental request");
  expect(markup).toContain("Checkout progress");
  expect(markup).not.toContain("Step 3 of 4");
  expect(markup).not.toContain('name="totalDue"');
  expect(markup).toContain("/cameras/test-camera?pickupDate=2099-08-24&amp;returnDate=2099-08-26&amp;handoffTime=09%3A00");
  const destination = vi.mocked(requirePageUser).mock.calls[0][0];
  expect(destination).toContain("/checkout?");
  expect(destination).not.toMatch(/totalDue|next|evil/);
  expect(loadBookingRequestPageContext).toHaveBeenCalledWith(expect.anything(), { ...selection, pickup: "", return: "" });
});

it("preserves selection through inline KYC and blocks suspended renters", async () => {
  vi.mocked(loadBookingRequestPageContext).mockResolvedValue({ ...context(), kycProfile: null } as never);
  const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(selection) }));
  expect(markup).toContain('data-kyc-return="/checkout?');
  expect(markup).toContain("policyVersion=3");
  expect(markup).not.toContain("Submit rental request");
  vi.mocked(loadBookingRequestPageContext).mockResolvedValue({ ...context(), profile: { ...context().profile, accountStatus: "suspended" } } as never);
  const suspended = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(selection) }));
  expect(suspended).toContain("Requests are unavailable");
  expect(suspended).not.toContain("Submit rental request");
});

it("fails closed when a schedule or context cannot be loaded", async () => {
  vi.mocked(loadBookingRequestPageContext).mockResolvedValue({ status: "error" });
  const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(selection) }));
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("Your checkout needs an updated estimate");
  expect(markup).toContain("Browse cameras");
  expect(markup).not.toContain("Submit rental request");
  expect(markup).not.toContain("Estimated total");
});

it("requires authentication before loading any private context", async () => {
  vi.mocked(requirePageUser).mockRejectedValue(new Error("redirect:login"));
  await expect(CheckoutPage({ searchParams: Promise.resolve(selection) })).rejects.toThrow("redirect:login");
  expect(loadBookingRequestPageContext).not.toHaveBeenCalled();
});

it("shows safe recovery after a rejected context read without exposing the exception", async () => {
  vi.mocked(loadBookingRequestPageContext).mockRejectedValue(new Error("private transport details"));
  const markup = renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve(selection) }));
  expect(markup).toContain("Your checkout needs an updated estimate");
  expect(markup).not.toContain("private transport details");
  expect(markup).not.toContain("Submit rental request");
});

it("redirects legacy links with supported first values and no price or external destination", async () => {
  const params = { ...selection, camera: [selection.camera, "other"], totalDue: "0", next: "https://evil.test", pickup: "2099-08-24T09:00", return: "2099-08-26T09:00" };
  try { await LegacyPage({ searchParams: Promise.resolve(params) }); } catch (error) {
    const url = new URL(String(error).replace("Error: redirect:", ""), "https://camnook.test");
    expect(url.pathname).toBe("/checkout");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...selection, pickup: params.pickup, return: params.return });
    return;
  }
  throw new Error("Expected a redirect");
});

it("recovers empty legacy links and announces loading", async () => {
  await expect(LegacyPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/checkout");
  expect(renderToStaticMarkup(<LoadingCheckout />)).toContain('role="status"');
});
