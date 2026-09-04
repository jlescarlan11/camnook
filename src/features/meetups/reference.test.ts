import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mintCanonicalAreaReference,
  mintRecommendationReference,
  readCanonicalAreaReference,
  readRecommendationReference,
} from "./reference";

const secret = "server-only-encryption-secret-value";
const claims = {
  address: "Cardinal Rosales Avenue, Cebu City",
  binding: "renter:camera:slot",
  city: "Cebu City",
  configVersion: "geoapify-v1",
  expiresAt: "2026-08-21T10:15:00.000Z",
  latitude: 10.317,
  longitude: 123.905,
  name: "Ayala Center Cebu",
  renterCity: {
    label: "Cebu City",
  },
  routingPolicyVersion: "mapbox-matrix-v1",
};

describe("recommendation references", () => {
  it("encrypts canonical-area claims and rejects stale, tampered, and cross-renter bindings", () => {
    const canonical = {
      areaCode: "0730600041",
      areaLabel: "Lahug",
      binding: "renter:camera:schedule:policy",
      expiresAt: "2026-08-21T10:15:00.000Z",
      kind: "canonical_area" as const,
      release: "2026-q2",
    };
    const reference = mintCanonicalAreaReference(canonical, secret);

    expect(reference).toMatch(/^v3\./);
    expect(reference).not.toContain("Lahug");
    expect(readCanonicalAreaReference(reference, secret, {
      binding: canonical.binding,
      now: new Date("2026-08-21T10:00:00.000Z"),
    })).toEqual(canonical);
    expect(readCanonicalAreaReference(reference, secret, {
      binding: "another-renter",
      now: new Date("2026-08-21T10:00:00.000Z"),
    })).toBeNull();
    expect(readCanonicalAreaReference(`${reference}x`, secret, {
      binding: canonical.binding,
    })).toBeNull();
    expect(readCanonicalAreaReference(reference, secret, {
      binding: canonical.binding,
      now: new Date(canonical.expiresAt),
    })).toBeNull();
  });

  it("encrypts the snapshot and validates binding before expiry", () => {
    const reference = mintRecommendationReference(claims, secret);

    expect(reference).not.toContain("Ayala");
    expect(
      readRecommendationReference(reference, secret, {
        binding: claims.binding,
        now: new Date("2026-08-21T10:00:00.000Z"),
      }),
    ).toEqual(claims);
    expect(
      readRecommendationReference(reference, secret, {
        binding: "another-renter",
        now: new Date("2026-08-21T10:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("rejects expired, modified, and malformed references", () => {
    const reference = mintRecommendationReference(claims, secret);

    expect(
      readRecommendationReference(reference, secret, {
        binding: claims.binding,
        now: new Date(claims.expiresAt),
      }),
    ).toBeNull();
    expect(
      readRecommendationReference(`${reference}x`, secret, {
        binding: claims.binding,
        now: new Date("2026-08-21T10:00:00.000Z"),
      }),
    ).toBeNull();
    expect(
      readRecommendationReference("v2.invalid", secret, {
        binding: claims.binding,
      }),
    ).toBeNull();
  });
});
