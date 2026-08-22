import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mintHandoffCityReference,
  readHandoffCityReference,
} from "./handoff-city-reference";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "server-only-handoff-city-secret-value";

function claims() {
  return {
    actorId: ACTOR_ID,
    cameraId: CAMERA_ID,
    city: {
      countryCode: "PH" as const,
      label: "Cebu City",
      latitude: 10.3157,
      longitude: 123.8854,
      providerCityId: "provider:cebu",
    },
    configVersion: "geoapify-v1",
    expectedVersion: 2,
    expiresAt: "2099-08-22T04:00:00.000Z",
  };
}

describe("handoff city reference", () => {
  it("round-trips trusted claims without exposing them as plaintext", () => {
    const reference = mintHandoffCityReference(claims(), SECRET);

    expect(reference).toMatch(/^handoff-city-v1\./);
    expect(reference).not.toMatch(/Cebu|provider|10\.3157|123\.8854/);
    expect(
      readHandoffCityReference(reference, SECRET, {
        actorId: ACTOR_ID,
        cameraId: CAMERA_ID,
        configVersion: "geoapify-v1",
        expectedVersion: 2,
        now: new Date("2099-08-22T03:59:00.000Z"),
      }),
    ).toEqual(claims());
  });

  it("rejects expiry, tampering, and every request binding mismatch", () => {
    const reference = mintHandoffCityReference(claims(), SECRET);
    const expected = {
      actorId: ACTOR_ID,
      cameraId: CAMERA_ID,
      configVersion: "geoapify-v1",
      expectedVersion: 2,
      now: new Date("2099-08-22T03:59:00.000Z"),
    };

    expect(
      readHandoffCityReference(`${reference}x`, SECRET, expected),
    ).toBeNull();
    expect(
      readHandoffCityReference(reference, SECRET, {
        ...expected,
        actorId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBeNull();
    expect(
      readHandoffCityReference(reference, SECRET, {
        ...expected,
        cameraId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toBeNull();
    expect(
      readHandoffCityReference(reference, SECRET, {
        ...expected,
        configVersion: "geoapify-v2",
      }),
    ).toBeNull();
    expect(
      readHandoffCityReference(reference, SECRET, {
        ...expected,
        expectedVersion: 3,
      }),
    ).toBeNull();
    expect(
      readHandoffCityReference(reference, SECRET, {
        ...expected,
        now: new Date("2099-08-22T04:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
