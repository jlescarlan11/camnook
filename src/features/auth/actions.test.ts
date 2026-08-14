import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));
vi.mock("@/lib/auth/pending-login", () => ({
  clearPendingLogin: vi.fn(),
  getPendingLogin: vi.fn(),
  setPendingLogin: vi.fn(),
}));
vi.mock("@/lib/auth/captcha-config", () => ({
  isTurnstileConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/server", () => ({
  clearSupabaseAuthCookies: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

import { redirect } from "next/navigation";

import {
  logout,
  requestEmailOtp,
  resendEmailOtp,
  verifyEmailOtp,
} from "./actions";
import {
  clearPendingLogin,
  getPendingLogin,
  setPendingLogin,
} from "@/lib/auth/pending-login";
import { isTurnstileConfigured } from "@/lib/auth/captcha-config";
import { initialAuthFormState } from "@/lib/auth/state";
import {
  clearSupabaseAuthCookies,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const redirectMock = vi.mocked(redirect);
const clearPendingLoginMock = vi.mocked(clearPendingLogin);
const getPendingLoginMock = vi.mocked(getPendingLogin);
const setPendingLoginMock = vi.mocked(setPendingLogin);
const isTurnstileConfiguredMock = vi.mocked(isTurnstileConfigured);
const createSupabaseServerClientMock = vi.mocked(
  createSupabaseServerClient,
);
const clearSupabaseAuthCookiesMock = vi.mocked(clearSupabaseAuthCookies);

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

function authClient(methods: Record<string, ReturnType<typeof vi.fn>>) {
  return { auth: methods } as never;
}

describe("email OTP actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTurnstileConfiguredMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an invalid email before contacting Supabase", async () => {
    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: "invalid", next: "/admin" }),
      ),
    ).resolves.toMatchObject({
      fieldErrors: { email: "Enter a valid email address." },
      status: "error",
    });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown renter", " New.Renter@Example.com ", "new.renter@example.com"],
    ["an existing renter", " Existing@Example.com ", "existing@example.com"],
  ])(
    "requests a public registration or sign-in code for %s",
    async (_accountType, submittedEmail, normalizedEmail) => {
      const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
      createSupabaseServerClientMock.mockResolvedValue(
        authClient({ signInWithOtp }),
      );

      await expect(
        requestEmailOtp(
          initialAuthFormState,
          formData({ email: submittedEmail, next: "/account" }),
        ),
      ).rejects.toThrow("redirect:/login/verify");

      expect(signInWithOtp).toHaveBeenCalledWith({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      expect(setPendingLoginMock).toHaveBeenCalledWith(
        normalizedEmail,
        "/account",
      );
      expect(redirectMock).toHaveBeenCalledWith("/login/verify");
    },
  );

  it.each(["signup_disabled", "user_not_found"])(
    "keeps the signup-disabled rollout response enumeration-resistant for %s",
    async (code) => {
      const signInWithOtp = vi.fn().mockResolvedValue({
        error: { code, status: 400 },
      });
      createSupabaseServerClientMock.mockResolvedValue(
        authClient({ signInWithOtp }),
      );
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(
        requestEmailOtp(
          initialAuthFormState,
          formData({ email: "unknown@example.com", next: "/account" }),
        ),
      ).rejects.toThrow("redirect:/login/verify");

      expect(setPendingLoginMock).toHaveBeenCalledWith(
        "unknown@example.com",
        "/account",
      );
      expect(redirectMock).toHaveBeenCalledWith("/login/verify");
    },
  );

  it("requires and forwards a CAPTCHA token when bot protection is configured", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    isTurnstileConfiguredMock.mockReturnValue(true);

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: "renter@example.com", next: "/account" }),
      ),
    ).resolves.toMatchObject({
      message: "Complete the security check, then request a code again.",
      status: "error",
    });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({
          captchaToken: "verified-challenge-token",
          email: "renter@example.com",
          next: "/account",
        }),
      ),
    ).rejects.toThrow("redirect:/login/verify");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "renter@example.com",
      options: {
        captchaToken: "verified-challenge-token",
        shouldCreateUser: true,
      },
    });
  });

  it("does not claim delivery or persist pending state when sending fails", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({
      error: {
        code: "unexpected_failure",
        message: "provider detail must stay private",
        name: "AuthApiError",
        status: 503,
      },
    });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: "private-email@example.com", next: "/account" }),
      ),
    ).resolves.toMatchObject({
      message: "We couldn’t send a code right now. Try again in a moment.",
      status: "error",
    });
    expect(setPendingLoginMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private-email@example.com",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "provider detail must stay private",
    );
  });

  it("returns safe feedback when the OTP provider request throws", async () => {
    const signInWithOtp = vi.fn().mockRejectedValue(new Error("network down"));
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: "renter@example.com", next: "/account" }),
      ),
    ).resolves.toMatchObject({ status: "error" });
    expect(setPendingLoginMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 429 }, "Too many code requests were made."],
    [{ code: "over_email_send_rate_limit" }, "Too many code requests were made."],
    [{ code: "captcha_failed" }, "Complete the security check"],
  ])("maps request protection failures to safe UI feedback", async (error, message) => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: "renter@example.com", next: "/account" }),
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining(message),
      status: "error",
    });
  });

  it("does not resend without a valid pending attempt", async () => {
    getPendingLoginMock.mockResolvedValue(null);

    await expect(
      resendEmailOtp(initialAuthFormState, new FormData()),
    ).resolves.toMatchObject({ status: "error" });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("requires a fresh CAPTCHA token for each repeated OTP request", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    getPendingLoginMock.mockResolvedValue({
      email: "renter@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    isTurnstileConfiguredMock.mockReturnValue(true);

    await expect(
      resendEmailOtp(initialAuthFormState, new FormData()),
    ).resolves.toMatchObject({ status: "error" });
    expect(signInWithOtp).not.toHaveBeenCalled();

    await expect(
      resendEmailOtp(
        initialAuthFormState,
        formData({ captchaToken: "fresh-resend-token" }),
      ),
    ).resolves.toMatchObject({ status: "success" });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "renter@example.com",
      options: {
        captchaToken: "fresh-resend-token",
        shouldCreateUser: true,
      },
    });
  });

  it.each([
    [{ code: "over_email_send_rate_limit", status: 429 }, "Too many code requests"],
    [{ code: "unexpected_failure", status: 503 }, "couldn’t send a code"],
  ])("keeps resend failures constrained and recoverable", async (error, message) => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error });
    getPendingLoginMock.mockResolvedValue({
      email: "renter@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      resendEmailOtp(initialAuthFormState, new FormData()),
    ).resolves.toMatchObject({
      message: expect.stringContaining(message),
      status: "error",
    });
    expect(setPendingLoginMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before contacting Supabase", async () => {
    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "12 456" }),
      ),
    ).resolves.toMatchObject({
      fieldErrors: { token: "Enter the 6-digit code from your email." },
      status: "error",
    });
    expect(getPendingLoginMock).not.toHaveBeenCalled();
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("verifies the pending email and redirects to its protected destination", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: { access_token: "redacted" }, user: { id: "user-1" } },
      error: null,
    });
    getPendingLoginMock.mockResolvedValue({
      email: "owner@example.com",
      returnTo: "/admin",
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ verifyOtp }));

    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "123456" }),
      ),
    ).rejects.toThrow("redirect:/admin");

    expect(verifyOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      token: "123456",
      type: "email",
    });
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });

  it.each([
    ["invalid", { code: "invalid_credentials", status: 403 }],
    ["expired", { code: "otp_expired", status: 403 }],
    ["reused", { code: "otp_expired", status: 403 }],
  ])("fails closed when Supabase reports a %s code", async (_case, error) => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error,
    });
    getPendingLoginMock.mockResolvedValue({
      email: "owner@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ verifyOtp }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "123456" }),
      ),
    ).resolves.toMatchObject({
      fieldErrors: {
        token:
          "That code is invalid, expired, or already used. Request a new code if needed.",
      },
      status: "error",
    });
    expect(clearPendingLoginMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated verification attempts without clearing pending state", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "over_request_rate_limit", status: 429 },
    });
    getPendingLoginMock.mockResolvedValue({
      email: "renter@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ verifyOtp }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "123456" }),
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Too many verification attempts"),
      status: "error",
    });
    expect(clearPendingLoginMock).not.toHaveBeenCalled();
  });

  it("distinguishes a returned verification outage from an invalid code", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "unexpected_failure", status: 503 },
    });
    getPendingLoginMock.mockResolvedValue({
      email: "renter@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ verifyOtp }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "123456" }),
      ),
    ).resolves.toMatchObject({
      message: "We couldn’t verify that code right now. Try again in a moment.",
      status: "error",
    });
    expect(clearPendingLoginMock).not.toHaveBeenCalled();
  });

  it("returns recoverable feedback when OTP verification throws", async () => {
    const verifyOtp = vi.fn().mockRejectedValue(new Error("network down"));
    getPendingLoginMock.mockResolvedValue({
      email: "renter@example.com",
      returnTo: "/account",
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ verifyOtp }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      verifyEmailOtp(
        initialAuthFormState,
        formData({ token: "123456" }),
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining("couldn’t verify"),
      status: "error",
    });
    expect(clearPendingLoginMock).not.toHaveBeenCalled();
  });

  it("signs out only the current session and clears pending state", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ signOut }));

    await expect(logout()).rejects.toThrow(
      "redirect:/login?signed_out=1",
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearSupabaseAuthCookiesMock).toHaveBeenCalledOnce();
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
  });

  it("still clears local state when the sign-out provider reports failure", async () => {
    const signOut = vi.fn().mockResolvedValue({
      error: { code: "unexpected_failure", status: 503 },
    });
    createSupabaseServerClientMock.mockResolvedValue(authClient({ signOut }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(logout()).rejects.toThrow(
      "redirect:/login?signed_out=1",
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearSupabaseAuthCookiesMock).toHaveBeenCalledOnce();
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/login?signed_out=1");
  });

  it("expires the local auth cookies when local sign-out throws", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("network down"));
    createSupabaseServerClientMock.mockResolvedValue(authClient({ signOut }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(logout()).rejects.toThrow(
      "redirect:/login?signed_out=1",
    );

    expect(clearSupabaseAuthCookiesMock).toHaveBeenCalledOnce();
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/login?signed_out=1");
  });

  it("expires auth cookies even when the Supabase client cannot be created", async () => {
    createSupabaseServerClientMock.mockRejectedValue(
      new Error("provider initialization failed"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(logout()).rejects.toThrow(
      "redirect:/login?signed_out=1",
    );

    expect(clearSupabaseAuthCookiesMock).toHaveBeenCalledOnce();
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
  });

  it("does not claim sign-out success when auth-cookie cleanup fails", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("network down"));
    createSupabaseServerClientMock.mockResolvedValue(authClient({ signOut }));
    clearSupabaseAuthCookiesMock.mockRejectedValue(
      new Error("cookie adapter failed"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(logout()).rejects.toThrow(
      "Local session cleanup could not be completed",
    );

    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
