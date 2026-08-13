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

  it.each(["/", "/login", "/administrator", "/accounts"])(
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

  it("preserves an owner booking detail destination and safe success flag", () => {
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
  ])("replaces an unsafe return destination: %s", (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBe("/account");
  });

  it("encodes the protected destination in the login URL", () => {
    expect(loginPath("/admin?tab=payments")).toBe(
      "/login?next=%2Fadmin%3Ftab%3Dpayments",
    );
  });
});
