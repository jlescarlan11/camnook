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

  it("preserves the exact nested booking path and non-sensitive query", async () => {
    mockClaims(null);

    const response = await updateSupabaseSession(
      new NextRequest(
        "https://camnook.test/account/bookings/new?camera=11111111-1111-4111-8111-111111111111&pickup=2099-08-14T09%3A00&return=2099-08-15T09%3A00",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://camnook.test/login?next=%2Faccount%2Fbookings%2Fnew%3Fcamera%3D11111111-1111-4111-8111-111111111111%26pickup%3D2099-08-14T09%253A00%26return%3D2099-08-15T09%253A00",
    );
  });

  it("preserves a renter booking detail path through public sign-in", async () => {
    mockClaims(null);

    const response = await updateSupabaseSession(
      new NextRequest(
        "https://camnook.test/account/bookings/22222222-2222-4222-8222-222222222222?requested=1",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://camnook.test/login?next=%2Faccount%2Fbookings%2F22222222-2222-4222-8222-222222222222%3Frequested%3D1",
    );
  });

  it("preserves an admin booking detail path through public sign-in", async () => {
    mockClaims(null);

    const response = await updateSupabaseSession(
      new NextRequest(
        "https://camnook.test/admin/bookings/22222222-2222-4222-8222-222222222222",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://camnook.test/login?next=%2Fadmin%2Fbookings%2F22222222-2222-4222-8222-222222222222",
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
