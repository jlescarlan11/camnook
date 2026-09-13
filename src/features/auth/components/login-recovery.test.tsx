/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ requestEmailOtp: action }));
import { LoginForm } from "./login-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains the email and return destination when retrying a failed sign-in request", async () => {
  const submissions: Record<string, FormDataEntryValue>[] = [];
  action.mockImplementation(async (_state, data: FormData) => {
    submissions.push(Object.fromEntries(data));
    return { status: "error", message: "Temporary failure. Retry." };
  });
  const returnTo = "/account/bookings/new?pickupDate=2099-08-24";
  render(<LoginForm captchaSiteKey={null} returnTo={returnTo} />);
  const email = screen.getByRole("textbox", { name: "Email address" });
  await userEvent.type(email, "renter@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
  await screen.findByRole("alert");
  expect((email as HTMLInputElement).value).toBe("renter@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions).toEqual([
    { email: "renter@example.test", next: returnTo },
    { email: "renter@example.test", next: returnTo },
  ]);
});
