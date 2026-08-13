import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/supabase/server", () => ({
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
import { initialAuthFormState } from "@/lib/auth/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectMock = vi.mocked(redirect);
const clearPendingLoginMock = vi.mocked(clearPendingLogin);
const getPendingLoginMock = vi.mocked(getPendingLogin);
const setPendingLoginMock = vi.mocked(setPendingLogin);
const createSupabaseServerClientMock = vi.mocked(
  createSupabaseServerClient,
);

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

  it("requests a code without creating an unknown account", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    createSupabaseServerClientMock.mockResolvedValue(
      authClient({ signInWithOtp }),
    );

    await expect(
      requestEmailOtp(
        initialAuthFormState,
        formData({ email: " Owner@Example.com ", next: "/admin" }),
      ),
    ).rejects.toThrow("redirect:/login/verify");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: { shouldCreateUser: false },
    });
    expect(setPendingLoginMock).toHaveBeenCalledWith(
      "owner@example.com",
      "/admin",
    );
    expect(redirectMock).toHaveBeenCalledWith("/login/verify");
  });

  it("does not resend without a valid pending attempt", async () => {
    getPendingLoginMock.mockResolvedValue(null);

    await expect(
      resendEmailOtp(initialAuthFormState, new FormData()),
    ).resolves.toMatchObject({ status: "error" });
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

  it("fails closed when Supabase rejects the code", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: { code: "otp_expired", status: 403 },
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
        token: "That code is invalid or has expired. Check it and try again.",
      },
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
    expect(clearPendingLoginMock).toHaveBeenCalledOnce();
  });
});
