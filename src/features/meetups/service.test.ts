import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MeetupProviderConfig } from "./config";
import { ProviderBoundaryError } from "./provider";
import { recommendPublicMeetup } from "./service";

const config: MeetupProviderConfig = {
  allowedCategories: ["commercial.shopping_mall"],
  apiKey: "provider-secret-key",
  configVersion: "geoapify-v1",
  referenceSecret: "recommendation-encryption-secret-value",
  searchRadiusMeters: 8000,
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

function adapter() {
  return {
    reverseGeocodeCity: vi.fn().mockResolvedValue({
      countryCode: "PH",
      label: "Cebu City",
      latitude: 10.3157,
      longitude: 123.8854,
      providerCityId: "city-cebu",
    }),
    searchPublicPlaces: vi.fn().mockResolvedValue([
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        categories: ["commercial.shopping_mall"],
        city: "Cebu City",
        latitude: 10.3172345,
        longitude: 123.9054321,
        name: "Ayala Center Cebu",
        providerPlaceId: "place-ayala",
      },
    ]),
  };
}

describe("recommendPublicMeetup", () => {
  it("fails closed with safe telemetry when server configuration is absent", async () => {
    const provider = adapter();
    const recordTelemetry = vi.fn();

    await expect(
      recommendPublicMeetup(input, {
        adapter: provider,
        config: null,
        recordTelemetry,
      }),
    ).resolves.toEqual({
      reason: "configuration",
      status: "unavailable",
    });
    expect(provider.reverseGeocodeCity).not.toHaveBeenCalled();
    expect(recordTelemetry).toHaveBeenCalledWith({
      durationBucket: "fast",
      resultCount: 0,
      status: "configuration",
    });
  });

  it("returns one safe coarse recommendation and redacted telemetry", async () => {
    const provider = adapter();
    const recordTelemetry = vi.fn();
    const result = await recommendPublicMeetup(input, {
      adapter: provider,
      config,
      now: new Date("2026-08-21T10:00:00.000Z"),
      recordTelemetry,
    });

    expect(result).toMatchObject({
      recommendation: {
        address: "Cardinal Rosales Avenue, Cebu City",
        attribution: "© OpenStreetMap contributors · Powered by Geoapify",
        city: "Cebu City",
        configVersion: "geoapify-v1",
        expiresAt: "2026-08-21T10:15:00.000Z",
        latitude: 10.317,
        longitude: 123.905,
        name: "Ayala Center Cebu",
        renterCity: "Cebu City",
        reference: expect.stringMatching(/^v1\./),
      },
      status: "available",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /provider-secret|place-ayala|renter-city-cebu|10\.30123456|123\.90123456/,
    );
    expect(recordTelemetry).toHaveBeenCalledWith({
      durationBucket: "fast",
      resultCount: 1,
      status: "available",
    });
    expect(JSON.stringify(recordTelemetry.mock.calls)).not.toMatch(
      /Ayala|Cardinal|provider|10\.|123\./,
    );
  });

  it("selects the same venue for repeated normalized inputs and fixtures", async () => {
    const first = await recommendPublicMeetup(input, {
      adapter: adapter(),
      config,
      now: new Date("2026-08-21T10:00:00.000Z"),
    });
    const second = await recommendPublicMeetup(input, {
      adapter: adapter(),
      config,
      now: new Date("2026-08-21T10:00:00.000Z"),
    });

    expect(first.status).toBe("available");
    expect(second.status).toBe("available");
    if (first.status === "available" && second.status === "available") {
      expect({ ...first.recommendation, reference: "redacted" }).toEqual({
        ...second.recommendation,
        reference: "redacted",
      });
    }
  });

  it("does not search when current coordinates or binding are invalid", async () => {
    const provider = adapter();
    const result = await recommendPublicMeetup(
      { ...input, currentPosition: { latitude: 91, longitude: 123 } },
      { adapter: provider, config },
    );

    expect(result).toEqual({ reason: "invalid_input", status: "unavailable" });
    expect(provider.reverseGeocodeCity).not.toHaveBeenCalled();
    expect(provider.searchPublicPlaces).not.toHaveBeenCalled();
  });

  it.each([
    "empty",
    "malformed",
    "network",
    "quota",
    "timeout",
    "unsupported_city",
  ] as const)("returns the safe %s unavailable category", async (code) => {
    const provider = adapter();
    provider.reverseGeocodeCity.mockRejectedValue(new ProviderBoundaryError(code));

    await expect(
      recommendPublicMeetup(input, { adapter: provider, config }),
    ).resolves.toEqual({ reason: code, status: "unavailable" });
  });

  it("returns empty when every provider result violates venue policy", async () => {
    const provider = adapter();
    provider.searchPublicPlaces.mockResolvedValue([
      {
        address: "Private house",
        categories: ["building.residential", "commercial.shopping_mall"],
        city: "Cebu City",
        latitude: 10.31,
        longitude: 123.9,
        name: "Unsafe",
        providerPlaceId: "unsafe",
      },
    ]);

    await expect(
      recommendPublicMeetup(input, { adapter: provider, config }),
    ).resolves.toEqual({ reason: "empty", status: "unavailable" });
  });
});
