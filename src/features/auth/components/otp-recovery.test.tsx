/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ verifyEmailOtp: verify, resendEmailOtp: vi.fn() }));
import { OtpForm } from "./otp-form";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains the entered code for retry after a temporary verification failure", async () => {
  const submissions: FormDataEntryValue[] = [];
  verify.mockImplementation(async (_state, data: FormData) => {
    submissions.push(data.get("token")!);
    return { status: "error", message: "Verification is temporarily unavailable. Retry." };
  });
  render(<OtpForm captchaSiteKey={null} startAgainHref="/login" />);
  const code = screen.getByRole("textbox", { name: "Verification code" });
  await userEvent.type(code, "000000");
  await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
  await screen.findByRole("alert");
  expect((code as HTMLInputElement).value).toBe("000000");
  await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
  await waitFor(() => expect(submissions).toEqual(["000000", "000000"]));
});
