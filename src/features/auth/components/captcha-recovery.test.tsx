/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect } from "react";

vi.mock("next/script", () => ({
  default: function Script({ onReady }: { onReady(): void }) {
    useEffect(() => onReady(), [onReady]);
    return null;
  },
}));
vi.mock("@/features/auth/actions", () => ({ requestEmailOtp: vi.fn() }));

import { LoginForm } from "./login-form";

afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.clearAllMocks();
});

it.each(["error-callback", "expired-callback"] as const)(
  "retries a %s without losing the email or enabling sign-in with a stale token",
  async (failure) => {
    let callbacks: Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
    let resetWidget: string | undefined;
    window.turnstile = {
      render: (_container, options) => { callbacks = options; return "test-widget"; },
      remove: () => {},
      reset: (widgetId) => { resetWidget = widgetId; },
    };
    const { container } = render(<LoginForm captchaSiteKey="test-site-key" returnTo="/checkout?pickupDate=2099-08-24" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email address" }), "renter@example.test");
    act(() => callbacks.callback("old-test-token"));
    const submit = screen.getByRole("button", { name: "Continue with email" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    act(() => callbacks[failure]());
    expect(submit.disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Retry security check" }));
    expect(resetWidget).toBe("test-widget");
    expect(screen.getByText("Complete the security check to continue.")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Email address" }) as HTMLInputElement).value).toBe("renter@example.test");
    expect(submit.disabled).toBe(true);
    expect(new FormData(container.querySelector("form")!).get("captchaToken")).toBe("");
    expect(new FormData(container.querySelector("form")!).get("next")).toBe("/checkout?pickupDate=2099-08-24");
    act(() => callbacks.callback("fresh-test-token"));
    expect(submit.disabled).toBe(false);
    expect(new FormData(container.querySelector("form")!).get("captchaToken")).toBe("fresh-test-token");
  },
);
