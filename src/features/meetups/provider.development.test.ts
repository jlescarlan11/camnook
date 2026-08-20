import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMeetupProviderConfig } from "./config";
import { rankEligiblePlaces } from "./domain";
import { GeoapifyAdapter, ProviderBoundaryError } from "./provider";

const runDevelopmentCheck =
  process.env.RUN_MEETUP_PROVIDER_DEVELOPMENT_CHECK === "1";

describe.skipIf(!runDevelopmentCheck)("Geoapify Development integration", () => {
  it("resolves Cebu city context and returns an eligible reviewed place or explicit no-coverage", async () => {
    expect(process.env.VERCEL_ENV).not.toBe("production");
    const config = getMeetupProviderConfig();
    expect(config, "Configure reviewed Development-only meetup secrets first").not.toBeNull();
    if (!config) return;

    const adapter = new GeoapifyAdapter({
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
    });
    const city = await adapter.reverseGeocodeCity({
      latitude: 10.3157,
      longitude: 123.8854,
    });
    expect(city).toMatchObject({ countryCode: "PH", label: expect.any(String) });

    try {
      const places = await adapter.searchPublicPlaces({
        allowedCategories: config.allowedCategories,
        center: { latitude: city.latitude, longitude: city.longitude },
        radiusMeters: config.searchRadiusMeters,
      });
      const winner = rankEligiblePlaces(
        places,
        city,
        config.allowedCategories,
      )[0];
      expect(winner, "Geoapify returned no reviewed Cebu public venue").toBeDefined();
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderBoundaryError);
      expect((error as ProviderBoundaryError).code).toMatch(
        /^(empty|unsupported_city)$/,
      );
    }
  });
});
