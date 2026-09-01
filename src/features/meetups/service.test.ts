import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MeetupProviderConfig, MeetupRoutingConfig } from "./config";
import { ProviderBoundaryError } from "./provider";
import { RoutingBoundaryError } from "./routing-provider";
import { recommendPublicMeetup } from "./service";

const config: MeetupProviderConfig = {
  allowedCategories: ["commercial.shopping_mall"],
  apiKey: "provider-secret-key",
  configVersion: "geoapify-v1",
  referenceSecret: "recommendation-encryption-secret-value",
  searchRadiusMeters: 8000,
  timeoutMs: 4000,
};
const routingConfig: MeetupRoutingConfig = {
  accessToken: "mapbox-server-token-value",
  maxCandidates: 8,
  maxElements: 16,
  profile: "driving-traffic",
  routingPolicyVersion: "mapbox-matrix-v1",
  timeoutMs: 4000,
};
const input = {
  binding: "renter:camera:slot",
  currentPosition: { latitude: 10.30123456, longitude: 123.90123456 },
  lenderCity: {
    countryCode: "PH" as const,
    label: "Cebu City",
    latitude: 10.3157,
    longitude: 123.8854,
    providerCityId: "city-cebu",
  },
};

function places(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    address: `${String.fromCharCode(65 + index)} Public Center, Cebu City`,
    categories: ["commercial.shopping_mall"],
    city: "Cebu City",
    latitude: 10.31 + index * 0.001,
    longitude: 123.9 + index * 0.001,
    name: String.fromCharCode(65 + index),
    providerPlaceId: `place-${index}`,
  }));
}

function geoAdapter(count = 1) {
  return {
    reverseGeocodeCity: vi.fn().mockResolvedValue({
      countryCode: "PH",
      label: "Cebu City",
      latitude: 10.3157,
      longitude: 123.8854,
      providerCityId: "city-cebu",
    }),
    searchPublicPlaces: vi.fn().mockResolvedValue(places(count)),
  };
}

function options(count = 1) {
  return {
    adapter: geoAdapter(count),
    config,
    reserveRoutingBudget: vi.fn().mockResolvedValue(true),
    routingAdapter: {
      calculateTravelTimes: vi.fn().mockResolvedValue(
        Array.from({ length: count }, (_, index) => ({
          ownerSeconds: 600 + index * 60,
          renterSeconds: 660 + index * 60,
        })),
      ),
    },
    routingConfig,
    routingPolicyVersion: "mapbox-matrix-v1",
  };
}

describe("recommendPublicMeetup", () => {
  it("fails closed when Geoapify configuration is absent", async () => {
    const provider = geoAdapter();
    const recordTelemetry = vi.fn();
    await expect(
      recommendPublicMeetup(input, {
        adapter: provider,
        config: null,
        recordTelemetry,
        routingConfig,
        routingPolicyVersion: "mapbox-matrix-v1",
      }),
    ).resolves.toEqual({ reason: "configuration", status: "unavailable" });
    expect(provider.reverseGeocodeCity).not.toHaveBeenCalled();
  });

  it("returns three independently bound options in balanced route order", async () => {
    const configured = options(4);
    configured.routingAdapter.calculateTravelTimes.mockResolvedValue([
      { ownerSeconds: 600, renterSeconds: 600 },
      { ownerSeconds: 300, renterSeconds: 780 },
      { ownerSeconds: 720, renterSeconds: 720 },
      { ownerSeconds: 60, renterSeconds: 1200 },
    ]);
    const recordTelemetry = vi.fn();
    const result = await recommendPublicMeetup(input, {
      ...configured,
      now: new Date("2026-08-21T10:00:00.000Z"),
      recordTelemetry,
    });

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.recommendations.map((item) => item.name)).toEqual(["A", "C", "B"]);
      expect(new Set(result.recommendations.map((item) => item.reference)).size).toBe(3);
      expect(result.recommendations[0]).toMatchObject({
        ownerCity: "Cebu City",
        ownerTravelMinutes: 10,
        routeEstimateApproximate: false,
        routeMode: "balanced",
        renterCity: "Cebu City",
        renterTravelMinutes: 10,
      });
      expect(result.recommendations[0].reference).toMatch(/^v2\./);
    }
    expect(configured.reserveRoutingBudget).toHaveBeenCalledWith(8);
    expect(recordTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCount: 4,
        elementCount: 8,
        routingStatus: "success",
        status: "available",
      }),
    );
    expect(JSON.stringify(recordTelemetry.mock.calls)).not.toMatch(
      /mapbox-server-token|Public Center|10\.3|123\.9/,
    );
  });

  it("excludes partial null routes and never invents a time", async () => {
    const configured = options(3);
    configured.routingAdapter.calculateTravelTimes.mockResolvedValue([
      { ownerSeconds: 600, renterSeconds: null },
      { ownerSeconds: 480, renterSeconds: 540 },
      { ownerSeconds: null, renterSeconds: null },
    ]);
    const result = await recommendPublicMeetup(input, configured);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0]).toMatchObject({
        name: "B",
        ownerTravelMinutes: 8,
        renterTravelMinutes: 9,
        routeMode: "balanced",
      });
    }
  });

  it.each([
    ["missing config", null, true],
    ["budget denial", routingConfig, false],
  ] as const)("uses a no-time Geoapify fallback for %s", async (_, routeConfig, budget) => {
    const configured = options(4);
    configured.reserveRoutingBudget.mockResolvedValue(budget);
    const result = await recommendPublicMeetup(input, {
      ...configured,
      routingConfig: routeConfig,
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.recommendations).toHaveLength(3);
      expect(result.recommendations[0]).toMatchObject({
        ownerTravelMinutes: null,
        renterTravelMinutes: null,
        routeMode: "geoapify_fallback",
      });
    }
    expect(configured.routingAdapter.calculateTravelTimes).not.toHaveBeenCalled();
  });

  it("rejects malformed routing configuration before budget reservation", async () => {
    const configured = options(3);
    const result = await recommendPublicMeetup(input, {
      ...configured,
      routingConfig: {
        ...routingConfig,
        profile: "walking",
      } as unknown as MeetupRoutingConfig,
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.recommendations.every((item) => item.routeMode === "geoapify_fallback")).toBe(true);
    }
    expect(configured.reserveRoutingBudget).not.toHaveBeenCalled();
    expect(configured.routingAdapter.calculateTravelTimes).not.toHaveBeenCalled();
  });

  it("uses the same no-time fallback for provider failures and all-unreachable output", async () => {
    for (const failure of [
      new RoutingBoundaryError("timeout"),
      [
        { ownerSeconds: null, renterSeconds: null },
        { ownerSeconds: null, renterSeconds: null },
      ],
    ]) {
      const configured = options(2);
      if (failure instanceof Error) {
        configured.routingAdapter.calculateTravelTimes.mockRejectedValue(failure);
      } else {
        configured.routingAdapter.calculateTravelTimes.mockResolvedValue(failure);
      }
      const result = await recommendPublicMeetup(input, configured);
      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.recommendations.every((item) => item.routeMode === "geoapify_fallback")).toBe(true);
        expect(result.recommendations.every((item) => item.renterTravelMinutes === null)).toBe(true);
      }
    }
  });

  it("labels manual-city route estimates as approximate", async () => {
    const configured = options();
    const result = await recommendPublicMeetup(
      {
        binding: input.binding,
        lenderCity: input.lenderCity,
        renterCity: {
          countryCode: "PH",
          label: "Mandaue City",
          latitude: 10.3236,
          longitude: 123.9222,
          providerCityId: "city-mandaue",
        },
      },
      configured,
    );
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.recommendations[0].routeEstimateApproximate).toBe(true);
    }
    expect(configured.adapter.reverseGeocodeCity).not.toHaveBeenCalled();
  });

  it("does not call providers for invalid coordinates", async () => {
    const configured = options();
    const result = await recommendPublicMeetup(
      { ...input, currentPosition: { latitude: 91, longitude: 123 } },
      configured,
    );
    expect(result).toEqual({ reason: "invalid_input", status: "unavailable" });
    expect(configured.adapter.searchPublicPlaces).not.toHaveBeenCalled();
    expect(configured.reserveRoutingBudget).not.toHaveBeenCalled();
  });

  it.each([
    "empty",
    "malformed",
    "network",
    "quota",
    "timeout",
    "unsupported_city",
  ] as const)("keeps Geoapify %s as a hard unavailable result", async (code) => {
    const configured = options();
    configured.adapter.reverseGeocodeCity.mockRejectedValue(
      new ProviderBoundaryError(code),
    );
    await expect(recommendPublicMeetup(input, configured)).resolves.toEqual({
      reason: code,
      status: "unavailable",
    });
  });

  it("rejects every private or incomplete venue instead of fabricating a fallback", async () => {
    const configured = options();
    configured.adapter.searchPublicPlaces.mockResolvedValue([
      {
        ...places()[0],
        address: "Private house",
        categories: ["building.residential", "commercial.shopping_mall"],
      },
    ]);
    await expect(recommendPublicMeetup(input, configured)).resolves.toEqual({
      reason: "empty",
      status: "unavailable",
    });
  });
});
