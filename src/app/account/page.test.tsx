import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requirePageUser: vi.fn() }));
vi.mock("@/features/bookings/data/account", () => ({ loadAccountOverview: vi.fn() }));
vi.mock("@/features/kyc/kyc-profile-form", () => ({ KycProfileForm: () => <form data-kyc-form /> }));
import { requirePageUser } from "@/lib/auth/require-user";
import { loadAccountOverview } from "@/features/bookings/data/account";
import AccountPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePageUser).mockResolvedValue({ user: { id: "renter" } } as never);
  vi.mocked(loadAccountOverview).mockResolvedValue({ status: "success", isAdmin: false, profile: null, bookings: [] });
});

it("keeps setup out of empty rentals and links to Profile", async () => {
  const html = renderToStaticMarkup(await AccountPage());
  expect(requirePageUser).toHaveBeenCalledWith("/account");
  expect(html).toContain("You don’t have any booking requests yet.");
  expect(html).toContain('href="/account/profile"');
  expect(html).toContain('id="default-address"');
  expect(html).toContain('href="/account/profile#renter-details"');
  expect(html).not.toContain("data-kyc-form");
  expect(html).not.toContain("Owner area");
  expect(html.match(/<main/g)).toHaveLength(1);
});

it("preserves booking destinations and owner controls", async () => {
  vi.mocked(loadAccountOverview).mockResolvedValue({
    status: "success", isAdmin: true, profile: null, bookings: [{
      id: "booking-1", camera: { name: "Canon EOS R50", slug: "canon" }, state: "FOR_REVIEW",
      pickupAt: "2099-09-26T02:00:00Z", returnAt: "2099-09-28T02:00:00Z",
      requestedAt: "2099-09-20T00:00:00Z", expectedLocation: "Cebu City", intendedUse: "Portraits", meetup: null,
    }],
  });
  const html = renderToStaticMarkup(await AccountPage());
  expect(html).toContain("Canon EOS R50");
  expect(html).toContain('href="/account/bookings/booking-1"');
  expect(html).toContain("Owner area");
  expect(html).not.toContain("data-kyc-form");
});

it.each(["error", "rejection"])("offers rental recovery and account navigation on %s", async (kind) => {
  if (kind === "error") vi.mocked(loadAccountOverview).mockResolvedValue({ status: "error" });
  else vi.mocked(loadAccountOverview).mockRejectedValue(new Error("private provider error"));
  const html = renderToStaticMarkup(await AccountPage());
  expect(html).toContain("Rentals unavailable");
  expect(html).toContain('href="/account/profile"');
  expect(html).toContain("Sign out");
  expect(html).not.toContain("don’t have any booking");
  expect(html).not.toContain("private provider error");
});

it("authenticates before loading private rentals", async () => {
  vi.mocked(requirePageUser).mockRejectedValue(new Error("redirect:login"));
  await expect(AccountPage()).rejects.toThrow("redirect:login");
  expect(loadAccountOverview).not.toHaveBeenCalled();
});
