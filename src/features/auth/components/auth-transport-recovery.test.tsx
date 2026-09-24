/** @vitest-environment jsdom */
import { Component, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ requestEmailOtp: vi.fn(), verifyEmailOtp: vi.fn(), resendEmailOtp: vi.fn() }));
vi.mock("@/features/auth/actions", () => actions);
import { LoginForm } from "./login-form";
import { OtpForm } from "./otp-form";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p>Unexpected form crash</p> : this.props.children; }
}
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function mount(child: ReactNode) { render(<Boundary>{child}</Boundary>, { onCaughtError: () => {} }); }

it("recovers an interrupted email request without losing email or destination", async () => {
  actions.requestEmailOtp.mockRejectedValueOnce(new Error("private transport error"))
    .mockResolvedValue({ status: "error", message: "Returned response" });
  mount(<LoginForm captchaSiteKey={null} returnTo="/checkout?camera=test" />);
  const input = screen.getByLabelText("Email address") as HTMLInputElement;
  await userEvent.type(input, "renter@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
  expect((await screen.findByRole("alert")).textContent).toContain("couldn’t confirm");
  expect(input.value).toBe("renter@example.test");
  expect(screen.queryByText(/private transport/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Continue with email" }));
  await screen.findByText("Returned response");
  const data = actions.requestEmailOtp.mock.calls[1][1] as FormData;
  expect(Object.fromEntries(data)).toEqual({email:"renter@example.test",next:"/checkout?camera=test"});
});

it("recovers interrupted verification and retries the same code", async () => {
  actions.verifyEmailOtp.mockRejectedValueOnce(new Error("private verification failure"))
    .mockResolvedValue({ status: "error", message: "Returned response" });
  mount(<OtpForm captchaSiteKey={null} startAgainHref="/login" />);
  const input = screen.getByLabelText("Verification code") as HTMLInputElement;
  await userEvent.type(input, "000000");
  await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
  expect((await screen.findByRole("alert")).textContent).toContain("couldn’t confirm");
  expect(input.value).toBe("000000");
  await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
  await screen.findByText("Returned response");
  expect((actions.verifyEmailOtp.mock.calls[1][1] as FormData).get("token")).toBe("000000");
});

it("recovers interrupted resend without discarding the current code", async () => {
  actions.resendEmailOtp.mockRejectedValueOnce(new Error("private resend failure"))
    .mockResolvedValue({ status: "success", message: "Returned response" });
  mount(<OtpForm captchaSiteKey={null} startAgainHref="/login" />);
  const input = screen.getByLabelText("Verification code") as HTMLInputElement;
  await userEvent.type(input, "000000");
  await userEvent.click(screen.getByRole("button", { name: "Send another code" }));
  expect((await screen.findByRole("status")).textContent).toContain("couldn’t confirm");
  expect(input.value).toBe("000000");
  await userEvent.click(screen.getByRole("button", { name: "Send another code" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Returned response"));
});
