import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./require-user", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  getAuthenticatedUser: vi.fn(),
  requireUser: vi.fn(),
}));

import {
  AdminAuthorizationCheckError,
  getAdminStatus,
} from "./require-admin";

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
});
