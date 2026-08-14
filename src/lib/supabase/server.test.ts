import { clearAuthCookiesAtScopes, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();

  return {
    ...actual,
    clearAuthCookiesAtScopes: vi.fn(actual.clearAuthCookiesAtScopes),
    createServerClient: vi.fn(),
  };
});
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./config", () => ({
  getSupabasePublicConfig: () => ({
    publishableKey: "publishable-test-key",
    url: "https://project.supabase.co",
  }),
}));

import {
  clearSupabaseAuthCookies,
  createSupabaseServerClient,
} from "./server";

const clearAuthCookiesAtScopesMock = vi.mocked(clearAuthCookiesAtScopes);
const createServerClientMock = vi.mocked(createServerClient);
const cookiesMock = vi.mocked(cookies);

describe("Supabase server cookie adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes request cookies through the server client adapter", async () => {
    const getAll = vi.fn(() => [{ name: "cookie", value: "value" }]);
    const set = vi.fn();
    cookiesMock.mockResolvedValue({ getAll, set } as never);
    createServerClientMock.mockReturnValue({ auth: {} } as never);

    await createSupabaseServerClient();

    const options = createServerClientMock.mock.calls[0]?.[2];
    expect(options?.cookies?.getAll?.()).toEqual([
      { name: "cookie", value: "value" },
    ]);
    options?.cookies?.setAll?.(
      [{ name: "updated", value: "session", options: { path: "/" } }],
      {},
    );
    expect(set).toHaveBeenCalledWith("updated", "session", { path: "/" });
  });

  it("expires only the current project's auth cookie and chunks", async () => {
    const getAll = vi.fn(() => [
      { name: "sb-project-auth-token", value: "session" },
      { name: "sb-project-auth-token.0", value: "chunk-zero" },
      { name: "sb-project-auth-token.1", value: "chunk-one" },
      { name: "sb-other-auth-token", value: "other-project" },
      { name: "camnook-auth-email", value: "pending" },
    ]);
    const set = vi.fn();
    cookiesMock.mockResolvedValue({ getAll, set } as never);

    await clearSupabaseAuthCookies();

    expect(clearAuthCookiesAtScopesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [{ path: "/" }],
        storageKey: "sb-project-auth-token",
      }),
    );
    expect(set.mock.calls.map(([name]) => name)).toEqual([
      "sb-project-auth-token",
      "sb-project-auth-token.0",
      "sb-project-auth-token.1",
    ]);
    set.mock.calls.forEach(([, value, options]) => {
      expect(value).toBe("");
      expect(options).toMatchObject({ maxAge: 0, path: "/" });
    });
  });
});
