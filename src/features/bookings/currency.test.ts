import { expect, it } from "vitest";
import { phpFormatter } from "./currency";

it("preserves centavos in rental, deposit, and total displays", () => {
  expect(phpFormatter.format(450.5)).toBe("₱450.50");
  expect(phpFormatter.format(1000.25)).toBe("₱1,000.25");
  expect(phpFormatter.format(1450.75)).toBe("₱1,450.75");
  expect(phpFormatter.format(0)).toBe("₱0.00");
});
