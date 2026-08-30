import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));
vi.mock("./require-user", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  getAuthenticatedUser: vi.fn(),
  requireUser: vi.fn(),
}));

import {
  AdminAuthorizationRequiredError,
  AdminAuthorizationCheckError,
  getAdminStatus,
  isAdminAuthorizationError,
  requireAdmin,
  requirePageAdmin,
} from "./require-admin";
import { getAuthenticatedUser, requireUser } from "./require-user";
import { redirect } from "next/navigation";

function contextWithRpcResult(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn().mockReturnValue({ rpc });

  return {
    context: { supabase: { schema }, user: { id: "test-user" } } as never,
    rpc,
    schema,
  };
}

describe("administrator authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognizes only the exact database admin denial", () => {
    expect(isAdminAuthorizationError({
      code: "42501",
      message: "admin authorization required",
    })).toBe(true);
    expect(isAdminAuthorizationError({
      code: "42501",
      message: "transport proxy denied the request",
    })).toBe(false);
    expect(isAdminAuthorizationError({
      code: "50000",
      message: "admin authorization required",
    })).toBe(false);
  });

  it.each([true, false])(
    "returns the database-backed admin decision: %s",
    async (isAdmin) => {
      const { context, rpc, schema } = contextWithRpcResult({
        data: isAdmin,
        error: null,
      });

      await expect(getAdminStatus(context)).resolves.toBe(isAdmin);
      expect(schema).toHaveBeenCalledWith("api");
      expect(rpc).toHaveBeenCalledWith("is_admin");
    },
  );

  it("fails closed when the authorization RPC is unavailable", async () => {
    const { context } = contextWithRpcResult({
      data: null,
      error: { message: "unavailable" },
    });

    await expect(getAdminStatus(context)).rejects.toBeInstanceOf(
      AdminAuthorizationCheckError,
    );
  });

  it("fails closed when the authorization RPC returns an unexpected value", async () => {
    const { context } = contextWithRpcResult({ data: null, error: null });

    await expect(getAdminStatus(context)).rejects.toBeInstanceOf(
      AdminAuthorizationCheckError,
    );
  });

  it("denies an authenticated non-admin at the mutation boundary", async () => {
    const { context, rpc } = contextWithRpcResult({ data: false, error: null });
    vi.mocked(requireUser).mockResolvedValue(context);

    await expect(requireAdmin()).rejects.toBeInstanceOf(
      AdminAuthorizationRequiredError,
    );
    expect(rpc).toHaveBeenCalledWith("is_admin");
  });

  it("redirects an unauthenticated nested admin page through the exact safe return path", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    await expect(
      requirePageAdmin(
        "/admin/bookings/22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toThrow("redirect:/login?next=");
    expect(redirect).toHaveBeenCalledWith(
      "/login?next=%2Fadmin%2Fbookings%2F22222222-2222-4222-8222-222222222222",
    );
  });

  it("redirects an authenticated non-admin page to the forbidden route", async () => {
    const { context } = contextWithRpcResult({ data: false, error: null });
    vi.mocked(getAuthenticatedUser).mockResolvedValue(context);

    await expect(requirePageAdmin("/admin")).rejects.toThrow(
      "redirect:/forbidden",
    );
    expect(redirect).toHaveBeenCalledWith("/forbidden");
  });
});
