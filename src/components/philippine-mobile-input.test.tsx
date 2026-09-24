// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { PhilippineMobileInput } from "./philippine-mobile-input";

afterEach(cleanup);

it("keeps the country code fixed while accepting a pasted local number", async () => {
  render(<label>Mobile number<PhilippineMobileInput aria-label="Mobile number" name="phone" required /></label>);
  const input = screen.getByRole("textbox", { name: "Mobile number" }) as HTMLInputElement;
  expect(screen.getByText("+63")).toBeTruthy();
  input.focus();
  await userEvent.paste("+63 995 712 8195");
  expect(input.value).toBe("9957128195");
  expect(input.checkValidity()).toBe(true);
});

it("prefills a saved local number and rejects an incomplete one", () => {
  render(<label>Mobile number<PhilippineMobileInput aria-label="Mobile number" name="phone" defaultValue="09171234567" required /></label>);
  const input = screen.getByRole("textbox", { name: "Mobile number" }) as HTMLInputElement;
  expect(input.value).toBe("9171234567");
  input.value = "917123";
  expect(input.checkValidity()).toBe(false);
});
