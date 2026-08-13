import { describe, expect, it } from "vitest";

import {
  isProtectedRoute,
  loginPath,
  sanitizeReturnTo,
} from "./routes";

describe("authentication route policy", () => {
  it.each(["/account", "/account/bookings", "/admin", "/admin/payments"])(
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
