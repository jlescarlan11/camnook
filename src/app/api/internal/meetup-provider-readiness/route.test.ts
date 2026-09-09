import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  calculateTravelTimes: vi.fn(),
  getMeetupProviderConfig: vi.fn(),
  getMeetupRoutingConfig: vi.fn(),
  reverseGeocodeCity: vi.fn(),
  runResidentialProductionSmoke: vi.fn(),
  searchPublicPlaces: vi.fn(),
}));

vi.mock("@/features/meetups/config", () => ({
  getMeetupProviderConfig: mocks.getMeetupProviderConfig,
  getMeetupRoutingConfig: mocks.getMeetupRoutingConfig,
}));
vi.mock("@/features/meetups/provider", () => ({
  GeoapifyAdapter: class {
    reverseGeocodeCity = mocks.reverseGeocodeCity;
    searchPublicPlaces = mocks.searchPublicPlaces;
  },
}));
vi.mock("@/features/meetups/routing-provider", () => ({
  MapboxMatrixAdapter: class {
    calculateTravelTimes = mocks.calculateTravelTimes;
  },
}));
vi.mock("@/features/kyc/production-smoke", () => ({
  runResidentialProductionSmoke: mocks.runResidentialProductionSmoke,
}));

import { POST } from "./route";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalResidentialMapKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
const authorization = "Bearer production-management-token-value";
const providerConfig = {
  allowedCategories: ["commercial.shopping_mall"],
  apiKey: "provider-key",
  configVersion: "geoapify-v1",
  referenceSecret: "recommendation-encryption-secret-value",
  searchRadiusMeters: 8_000,
  timeoutMs: 4_000,
};
const routingConfig = {
  accessToken: "mapbox-token-value",
  maxCandidates: 8,
  maxElements: 16,
  profile: "driving-traffic",
  routingPolicyVersion: "mapbox-matrix-v1",
  timeoutMs: 4_000,
};

function request(header = authorization) {
  return new Request("https://candidate.vercel.app/api/internal/meetup-provider-readiness", {
    headers: header ? { authorization: header } : {},
    method: "POST",
  });
}

describe("Production meetup provider readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY =
      "dedicated-browser-map-key-value";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(url.startsWith("https://maps.geoapify.com/")
        ? new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
          })
        : new Response("{}"));
    }));
    mocks.getMeetupProviderConfig.mockReturnValue(providerConfig);
    mocks.getMeetupRoutingConfig.mockReturnValue(routingConfig);
    mocks.reverseGeocodeCity.mockResolvedValue({
      countryCode: "PH",
      label: "Mandaue City",
      latitude: 10.3236,
      longitude: 123.9222,
      providerCityId: "provider-city",
    });
    mocks.searchPublicPlaces.mockResolvedValue([
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        categories: ["commercial.shopping_mall"],
        city: "Cebu City",
        latitude: 10.3172,
        longitude: 123.9054,
        name: "Ayala Center Cebu",
        providerPlaceId: "provider-place",
      },
    ]);
    mocks.calculateTravelTimes.mockResolvedValue([
      { ownerSeconds: 600, renterSeconds: 720 },
      { ownerSeconds: 660, renterSeconds: 540 },
      { ownerSeconds: 900, renterSeconds: 780 },
    ]);
    mocks.runResidentialProductionSmoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
    if (originalResidentialMapKey === undefined) {
      delete process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
    } else {
      process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY = originalResidentialMapKey;
    }
  });

  it("rejects missing or unverified Production management authorization", async () => {
    await expect(POST(request(""))).resolves.toMatchObject({ status: 401 });
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(POST(request())).resolves.toMatchObject({ status: 401 });
    expect(mocks.reverseGeocodeCity).not.toHaveBeenCalled();
  });

  it("fails closed when runtime provider configuration is incomplete", async () => {
    mocks.getMeetupProviderConfig.mockReturnValue(null);
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "configuration_unavailable",
    });
  });

  it("fails closed when the dedicated residential browser map key is unavailable", async () => {
    delete process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
    let response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "residential_map_configuration_unavailable",
    });

    process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY = providerConfig.apiKey;
    response = await POST(request());
    expect(response.status).toBe(503);
  });

  it("fails closed when the Production-origin tile probe is rejected", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(url.startsWith("https://maps.geoapify.com/")
        ? new Response("forbidden", { status: 403 })
        : new Response("{}"));
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "residential_map_configuration_unavailable",
    });
  });

  it("returns only bounded aggregate provider evidence", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      geoapify: "passed",
      mapbox: "passed",
      providerRequestCount: 3,
      residentialKyc: "passed",
      residentialMapTiles: "passed",
      routeElementCount: 6,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "maps.geoapify.com",
        pathname: "/v1/tile/osm-bright/12/3457/1929.png",
      }),
      expect.objectContaining({
        headers: {
          Origin: "https://camnook.shop",
          Referer: "https://camnook.shop/account",
        },
      }),
    );
    expect(mocks.searchPublicPlaces).toHaveBeenCalledTimes(1);
    expect(mocks.runResidentialProductionSmoke).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toMatch(
      /Ayala|Mandaue|provider-place|10\.3|123\.9/,
    );
  });

  it("fails closed without exposing provider details", async () => {
    mocks.calculateTravelTimes.mockRejectedValue(new Error("private provider detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "provider_unavailable" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private provider detail");
  });
});
