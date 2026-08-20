import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMeetupProviderConfig } from "./config";

const names = [
  "GEOAPIFY_API_KEY",
  "MEETUP_ALLOWED_CATEGORIES",
  "MEETUP_PROVIDER_CONFIG_VERSION",
  "MEETUP_PROVIDER_TIMEOUT_MS",
  "MEETUP_RECOMMENDATION_SECRET",
  "MEETUP_SEARCH_RADIUS_METERS",
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
  it("fails closed when a secret or reviewed category is missing", () => {
    process.env.GEOAPIFY_API_KEY = "provider-key";
    process.env.MEETUP_RECOMMENDATION_SECRET = "x".repeat(32);
    process.env.MEETUP_ALLOWED_CATEGORIES = "catering.cafe";
    expect(getMeetupProviderConfig()).toBeNull();

    delete process.env.GEOAPIFY_API_KEY;
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    expect(getMeetupProviderConfig()).toBeNull();
  });

  it("returns trimmed server configuration with bounded defaults", () => {
    process.env.GEOAPIFY_API_KEY = " provider-key ";
    process.env.MEETUP_RECOMMENDATION_SECRET = "s".repeat(32);
    process.env.MEETUP_ALLOWED_CATEGORIES =
      "commercial.shopping_mall, public_transport.train";

    expect(getMeetupProviderConfig()).toEqual({
      allowedCategories: [
        "commercial.shopping_mall",
        "public_transport.train",
      ],
      apiKey: "provider-key",
      configVersion: "geoapify-v1",
      referenceSecret: "s".repeat(32),
      searchRadiusMeters: 8000,
      timeoutMs: 4000,
    });
  });
});
