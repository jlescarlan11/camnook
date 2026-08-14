import { describe, expect, it } from "vitest";

import { captchaTokenSchema, emailOtpSchema, emailSchema } from "./validation";

describe("authentication input validation", () => {
  it("normalizes a valid email address", () => {
    expect(emailSchema.parse("  Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
  });

  it.each([
    "",
    "not-an-email",
    `${"a".repeat(250)}@example.com`,
  ])("rejects invalid email input: %s", (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });

  it("accepts exactly six ASCII digits as an email OTP", () => {
    expect(emailOtpSchema.parse(" 012345 ")).toBe("012345");
  });

  it.each(["12345", "1234567", "12 456", "abcdef", "１２３４５６"])(
    "rejects an invalid OTP: %s",
    (token) => {
      expect(emailOtpSchema.safeParse(token).success).toBe(false);
    },
  );

  it("accepts a trimmed CAPTCHA response within the provider token bound", () => {
    expect(captchaTokenSchema.parse(" verified-token ")).toBe(
      "verified-token",
    );
  });

  it.each(["", "   ", "x".repeat(4097)])(
    "rejects an invalid CAPTCHA response",
    (token) => {
      expect(captchaTokenSchema.safeParse(token).success).toBe(false);
    },
  );
});
