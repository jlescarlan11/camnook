import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("./config", () => ({
  getSupabasePublicConfig: () => ({
    publishableKey: "publishable-test-key",
    url: "https://project.supabase.co",
  }),
}));

import { updateSupabaseSession } from "./proxy";

const createServerClientMock = vi.mocked(createServerClient);

function mockClaims(claims: { sub?: string } | null, withRefresh = false) {
  createServerClientMock.mockImplementation((_url, _key, options) => {
    if (withRefresh) {
      options.cookies.setAll?.(
        [
          {
            name: "sb-session",
            options: { httpOnly: true, path: "/" },
            value: "refreshed",
          },
        ],
        { "Cache-Control": "private, no-store" },
      );
    }

    return {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: claims ? { claims } : null,
          error: claims ? null : { name: "AuthSessionMissingError" },
        }),
      },
    } as never;
  });
}

describe("Supabase session proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an unauthenticated protected request to login", async () => {
    mockClaims(null);

    const response = await updateSupabaseSession(
      new NextRequest("https://camnook.test/admin?tab=payments"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://camnook.test/login?next=%2Fadmin%3Ftab%3Dpayments",
    );
  });

  it("redirects a signed-in user away from login to a safe destination", async () => {
    mockClaims({ sub: "user-1" });

    const response = await updateSupabaseSession(
      new NextRequest("https://camnook.test/login?next=%2Fadmin"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://camnook.test/admin",
    );
  });

  it("preserves refreshed cookies and cache headers on a redirect", async () => {
    mockClaims(null, true);

    const response = await updateSupabaseSession(
      new NextRequest("https://camnook.test/account"),
    );

    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
