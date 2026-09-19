import { describe, expect, it } from "vitest";

import {
  isProtectedRoute,
  loginPath,
  sanitizeReturnTo,
} from "./routes";

describe("authentication route policy", () => {
  it.each([
    "/account",
    "/account/bookings",
    "/account/bookings/new",
    "/checkout",
    "/account/bookings/22222222-2222-4222-8222-222222222222",
    "/admin",
    "/admin/bookings/22222222-2222-4222-8222-222222222222",
    "/admin/payments",
  ])(
    "protects %s",
    (pathname) => {
      expect(isProtectedRoute(pathname)).toBe(true);
    },
  );

  it.each(["/", "/login", "/administrator", "/accounts", "/checkouts", "/checkout-evil"])(
    "does not overmatch %s",
    (pathname) => {
      expect(isProtectedRoute(pathname)).toBe(false);
    },
  );

  it("preserves an internal protected destination and query", () => {
    expect(sanitizeReturnTo("/admin?tab=payments")).toBe(
      "/admin?tab=payments",
    );
  });

  it("preserves the exact nested booking request destination", () => {
    expect(
      sanitizeReturnTo(
        "/account/bookings/new?camera=11111111-1111-4111-8111-111111111111&pickup=2099-08-14T09%3A00&return=2099-08-15T09%3A00",
      ),
    ).toBe(
      "/account/bookings/new?camera=11111111-1111-4111-8111-111111111111&pickup=2099-08-14T09%3A00&return=2099-08-15T09%3A00",
    );
  });

  it("preserves a renter booking detail destination and safe success flag", () => {
    expect(
      sanitizeReturnTo(
        "/account/bookings/22222222-2222-4222-8222-222222222222?requested=1",
      ),
    ).toBe(
      "/account/bookings/22222222-2222-4222-8222-222222222222?requested=1",
    );
  });

  it("preserves the exact nested admin booking destination", () => {
    expect(
      sanitizeReturnTo(
        "/admin/bookings/22222222-2222-4222-8222-222222222222",
      ),
    ).toBe("/admin/bookings/22222222-2222-4222-8222-222222222222");
    expect(
      loginPath("/admin/bookings/22222222-2222-4222-8222-222222222222"),
    ).toBe(
      "/login?next=%2Fadmin%2Fbookings%2F22222222-2222-4222-8222-222222222222",
    );
  });

  it.each([
    "https://example.com/admin",
    "//example.com/admin",
    "/login",
    "/administrator",
    "javascript:alert(1)",
    "/checkouts",
    "/checkout-evil",
    "/checkout?bad=%zz",
    "//camnook.invalid/checkout",
    "/\\evil.test/checkout",
    "/checkout\n",
  ])("replaces an unsafe return destination: %s", (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBe("/account");
  });

  it("encodes the protected destination in the login URL", () => {
    expect(loginPath("/admin?tab=payments")).toBe(
      "/login?next=%2Fadmin%3Ftab%3Dpayments",
    );
  });

  it("preserves the complete checkout schedule through login", () => {
    const destination = "/checkout?camera=11111111-1111-4111-8111-111111111111&pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00&policyVersion=3";
    expect(sanitizeReturnTo(destination)).toBe(destination);
    expect(new URL(loginPath(destination), "https://camnook.test").searchParams.get("next")).toBe(destination);
  });

  it("replaces return destinations that would overflow redirect or cookie limits", () => {
    expect(sanitizeReturnTo(`/account?query=${"a".repeat(1_100)}`)).toBe(
      "/account",
    );
    expect(sanitizeReturnTo(`/account?query=${"é".repeat(340)}`)).toBe(
      "/account",
    );
  });
});
