import { describe, expect, it } from "vitest";

import { mobileInputDigits, normalizePhilippineMobile, philippineMobileSchema } from "./philippine-mobile";

describe("Philippine mobile numbers", () => {
  it.each([
    ["9957128195", "+639957128195"],
    ["09957128195", "+639957128195"],
    ["+639957128195", "+639957128195"],
    ["+63 995 712 8195", "+639957128195"],
    ["639957128195", "+639957128195"],
  ])("normalizes %s for storage", (input, expected) => {
    expect(normalizePhilippineMobile(input)).toBe(expected);
    expect(philippineMobileSchema.parse(input)).toBe(expected);
  });

  it.each(["", "995712819", "99571281955", "8957128195", "+649957128195", "1234567890", "99571281ab"])(
    "rejects %s", (input) => {
      expect(normalizePhilippineMobile(input)).toBeNull();
      expect(philippineMobileSchema.safeParse(input).success).toBe(false);
    },
  );

  it("shows saved and pasted numbers as the ten editable digits", () => {
    expect(mobileInputDigits("+63 995 712 8195")).toBe("9957128195");
    expect(mobileInputDigits("09957128195")).toBe("9957128195");
    expect(mobileInputDigits("9957128195")).toBe("9957128195");
  });

  it("does not turn an overlong pasted number into a different valid number", () => {
    expect(mobileInputDigits("+6399571281950")).toBe("99571281950");
  });
});
