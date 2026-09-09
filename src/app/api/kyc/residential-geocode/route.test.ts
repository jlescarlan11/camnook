import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/features/meetups/config", () => ({ getResidentialGeocodingConfig: vi.fn() }));
vi.mock("@/features/meetups/provider-budget", () => ({ claimGeoapifyProviderBudget: vi.fn() }));
vi.mock("@/features/meetups/provider", () => ({
  GeoapifyAdapter: vi.fn(),
  ProviderBoundaryError: class ProviderBoundaryError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

import { getResidentialGeocodingConfig } from "@/features/meetups/config";
import { GeoapifyAdapter } from "@/features/meetups/provider";
import { claimGeoapifyProviderBudget } from "@/features/meetups/provider-budget";
import { getAuthenticatedUser } from "@/lib/auth/require-user";

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://camnook.test/api/kyc/residential-geocode", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("residential geocoding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getResidentialGeocodingConfig).mockReturnValue({ apiKey: "secret-key", timeoutMs: 100 });
    vi.mocked(claimGeoapifyProviderBudget).mockResolvedValue(true);
    vi.mocked(GeoapifyAdapter).mockImplementation(function MockGeoapifyAdapter() {
      return {
        reverseGeocodeResidentialAddress: vi.fn().mockResolvedValue({ label: "Cebu City" }),
        searchResidentialAddresses: vi.fn().mockResolvedValue([{ label: "Mango Avenue", latitude: 10.3, longitude: 123.9 }]),
      } as never;
    });
  });

  it("requires an authenticated actor before provider or budget work", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await POST(request({ mode: "search", query: "Mango" }));
    expect(response.status).toBe(401);
    expect(claimGeoapifyProviderBudget).not.toHaveBeenCalled();
  });

  it("validates the request before consuming budget", async () => {
    const response = await POST(request({ mode: "reverse", latitude: 1, longitude: 1 }));
    expect(response.status).toBe(400);
    expect(claimGeoapifyProviderBudget).not.toHaveBeenCalled();
  });

  it("bounds the request body before consuming provider budget", async () => {
    const response = await POST(new Request(
      "https://camnook.test/api/kyc/residential-geocode",
      { body: "x".repeat(2_049), method: "POST" },
    ));
    expect(response.status).toBe(413);
    expect(claimGeoapifyProviderBudget).not.toHaveBeenCalled();
  });

  it("claims one actor budget unit and returns normalized search results", async () => {
    const response = await POST(request({ mode: "search", query: "Mango Avenue" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [{
      label: "Mango Avenue", latitude: 10.3, longitude: 123.9,
    }] });
    expect(claimGeoapifyProviderBudget).toHaveBeenCalledWith("user-1", 1);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("fails closed when configuration or budget is unavailable", async () => {
    vi.mocked(getResidentialGeocodingConfig).mockReturnValue(null);
    const response = await POST(request({ mode: "search", query: "Mango Avenue" }));
    expect(response.status).toBe(503);
    expect(GeoapifyAdapter).not.toHaveBeenCalled();
  });
});
