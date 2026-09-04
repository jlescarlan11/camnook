import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMeetupProviderConfig,
  getMeetupRoutingConfig,
} from "./config";

const names = [
  "GEOAPIFY_API_KEY",
  "MEETUP_PROVIDER_CONFIG_VERSION",
  "MEETUP_PROVIDER_TIMEOUT_MS",
  "MEETUP_RECOMMENDATION_SECRET",
  "MEETUP_SEARCH_RADIUS_METERS",
  "MAPBOX_ACCESS_TOKEN",
  "MEETUP_ROUTING_MAX_CANDIDATES",
  "MEETUP_ROUTING_MAX_ELEMENTS",
  "MEETUP_ROUTING_POLICY_VERSION",
  "MEETUP_ROUTING_PROFILE",
  "MEETUP_ROUTING_TIMEOUT_MS",
] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
describe("meetup provider configuration", () => {
  it("fails closed when a required secret is missing", () => {
    process.env.GEOAPIFY_API_KEY = "provider-key";
    process.env.MEETUP_RECOMMENDATION_SECRET = "x".repeat(32);
    expect(getMeetupProviderConfig()).not.toBeNull();

    delete process.env.GEOAPIFY_API_KEY;
    expect(getMeetupProviderConfig()).toBeNull();
  });

  it("returns the code-owned busy-public policy with bounded defaults", () => {
    process.env.GEOAPIFY_API_KEY = " provider-key ";
    process.env.MEETUP_RECOMMENDATION_SECRET = "s".repeat(32);

    expect(getMeetupProviderConfig()).toEqual({
      allowedCategories: [
        "commercial.shopping_mall",
        "catering.fast_food",
        "education.university",
        "service.police",
      ],
      apiKey: "provider-key",
      configVersion: "geoapify-v1",
      referenceSecret: "s".repeat(32),
      searchRadiusMeters: 8000,
      timeoutMs: 4000,
    });
  });

  it("accepts only the bounded driving-traffic routing contract", () => {
    process.env.MAPBOX_ACCESS_TOKEN = "mapbox-server-token-value";
    expect(getMeetupRoutingConfig()).toEqual({
      accessToken: "mapbox-server-token-value",
      maxCandidates: 8,
      maxElements: 16,
      profile: "driving-traffic",
      routingPolicyVersion: "mapbox-matrix-v1",
      timeoutMs: 4000,
    });

    process.env.MEETUP_ROUTING_PROFILE = "driving";
    expect(getMeetupRoutingConfig()).toBeNull();
    process.env.MEETUP_ROUTING_PROFILE = "driving-traffic";
    process.env.MEETUP_ROUTING_MAX_CANDIDATES = "8";
    process.env.MEETUP_ROUTING_MAX_ELEMENTS = "15";
    expect(getMeetupRoutingConfig()).toBeNull();
  });
});
