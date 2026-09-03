import { describe, expect, it } from "vitest";

import {
  calculateSearchCenter,
  buildDiscoverySeeds,
  coarseCoordinate,
  rankEligiblePlaces,
  rankPlacesByBalancedTravel,
  type ProviderPlace,
} from "./domain";

const center = { latitude: 10.3157, longitude: 123.8854 };

function place(overrides: Partial<ProviderPlace> = {}): ProviderPlace {
  return {
    address: "Cardinal Rosales Avenue, Cebu City",
    categories: ["commercial.shopping_mall"],
    city: "Cebu City",
    latitude: 10.3172,
    longitude: 123.9054,
    name: "Ayala Center Cebu",
    providerPlaceId: "place-ayala",
    ...overrides,
  };
}

describe("meetup recommendation domain", () => {
  it("calculates the same spherical center for the same city pair", () => {
    const first = calculateSearchCenter(
      { latitude: 10.3157, longitude: 123.8854 },
      { latitude: 10.328, longitude: 123.903 },
    );
    const second = calculateSearchCenter(
      { latitude: 10.3157, longitude: 123.8854 },
      { latitude: 10.328, longitude: 123.903 },
    );

    expect(first).toEqual(second);
    expect(first).toEqual({ latitude: 10.32185, longitude: 123.8942 });
  });

  it("handles a search center across the international date line", () => {
    expect(
      calculateSearchCenter(
        { latitude: 10, longitude: 179 },
        { latitude: 10, longitude: -179 },
      ),
    ).toEqual({ latitude: 10.001493, longitude: -180 });
  });

  it("builds deterministic owner, renter, and midpoint discovery seeds", () => {
    expect(buildDiscoverySeeds(
      { latitude: 10.3157, longitude: 123.8854 },
      { latitude: 10.3236, longitude: 123.9222 },
    )).toEqual([
      { latitude: 10.3157, longitude: 123.8854 },
      { latitude: 10.3236, longitude: 123.9222 },
      calculateSearchCenter(
        { latitude: 10.3157, longitude: 123.8854 },
        { latitude: 10.3236, longitude: 123.9222 },
      ),
    ]);
  });

  it.each([
    ["Cebu–Mandaue", { latitude: 10.3157, longitude: 123.8854 }, { latitude: 10.3236, longitude: 123.9222 }],
    ["Cebu–Lapu-Lapu bridge", { latitude: 10.3157, longitude: 123.8854 }, { latitude: 10.3103, longitude: 123.9494 }],
    ["Cebu–Talisay", { latitude: 10.3157, longitude: 123.8854 }, { latitude: 10.2447, longitude: 123.8494 }],
  ])("retains both origin neighborhoods for %s even when the midpoint is unsuitable", (_label, owner, renter) => {
    const seeds = buildDiscoverySeeds(owner, renter);
    expect(seeds).toHaveLength(3);
    expect(seeds[0]).toEqual(owner);
    expect(seeds[1]).toEqual(renter);
    expect(seeds[2]).toEqual(calculateSearchCenter(owner, renter));
  });

  it("rejects incomplete, private, residential, and non-allowlisted results", () => {
    const ranked = rankEligiblePlaces(
      [
        place(),
        place({ name: "" }),
        place({ categories: ["accommodation.hotel", "commercial.shopping_mall"] }),
        place({ categories: ["building.residential", "commercial.shopping_mall"] }),
        place({ categories: ["catering.cafe"] }),
      ],
      center,
      ["commercial.shopping_mall"],
    );

    expect(ranked.map((candidate) => candidate.providerPlaceId)).toEqual([
      "place-ayala",
    ]);
  });

  it("rejects generic route-number names and coordinates outside every reviewed seed radius", () => {
    const ranked = rankEligiblePlaces(
      [
        place(),
        place({ name: "17B", providerPlaceId: "route-number" }),
        place({ name: "Unnamed Road", providerPlaceId: "unnamed-road" }),
        place({ latitude: 14.5995, longitude: 120.9842, providerPlaceId: "wrong-area" }),
      ],
      center,
      ["commercial.shopping_mall"],
      { discoverySeeds: [center], radiusMeters: 20_000 },
    );
    expect(ranked.map((candidate) => candidate.providerPlaceId)).toEqual(["place-ayala"]);
  });

  it("rejects a near-coordinate venue whose administrative locality is incompatible", () => {
    const ranked = rankEligiblePlaces(
      [
        place(),
        place({
          address: "Nearby provider record",
          city: "Manila",
          providerPlaceId: "nearby-wrong-locality",
        }),
      ],
      center,
      ["commercial.shopping_mall"],
      {
        allowedLocalities: ["City of Cebu", "Mandaue City"],
        discoverySeeds: [center],
        radiusMeters: 20_000,
      },
    );

    expect(ranked.map((candidate) => candidate.providerPlaceId)).toEqual([
      "place-ayala",
    ]);
  });

  it("ranks by calculated distance, configured category order, then stable text", () => {
    const equalCoordinate = { latitude: 10.32, longitude: 123.89 };
    const ranked = rankEligiblePlaces(
      [
        place({
          ...equalCoordinate,
          categories: ["public_transport.train"],
          name: "Station",
          providerPlaceId: "station",
        }),
        place({
          ...equalCoordinate,
          name: "Zulu Mall",
          providerPlaceId: "zulu",
        }),
        place({
          ...equalCoordinate,
          name: " Alpha   Mall ",
          providerPlaceId: "alpha",
        }),
        place({
          latitude: 10.4,
          longitude: 123.9,
          name: "Closer by provider order only",
          providerPlaceId: "far",
        }),
      ],
      center,
      ["commercial.shopping_mall", "public_transport.train"],
    );

    expect(ranked.map((candidate) => candidate.providerPlaceId)).toEqual([
      "alpha",
      "zulu",
      "station",
      "far",
    ]);
    expect(ranked[0]?.name).toBe("Alpha Mall");
  });

  it("rounds client-safe venue coordinates to three decimals", () => {
    expect(coarseCoordinate(10.3157123)).toBe(10.316);
    expect(coarseCoordinate(123.8854123)).toBe(123.885);
  });

  it("deduplicates provider identities and equivalent normalized venues", () => {
    const ranked = rankEligiblePlaces(
      [
        place(),
        place({ name: " Ayala   Center Cebu " }),
        place({ providerPlaceId: "duplicate-id" }),
      ],
      center,
      ["commercial.shopping_mall"],
    );
    expect(ranked).toHaveLength(1);
  });

  it("balances the worse trip, then total trip, then deterministic venue order", () => {
    const candidates = [
      place({ name: "A", providerPlaceId: "a" }),
      place({ name: "B", providerPlaceId: "b" }),
      place({ name: "C", providerPlaceId: "c" }),
      place({ name: "D", providerPlaceId: "d" }),
    ];
    const ranked = rankPlacesByBalancedTravel(candidates, [
      { ownerSeconds: 600, renterSeconds: 600 },
      { ownerSeconds: 300, renterSeconds: 780 },
      { ownerSeconds: 720, renterSeconds: 720 },
      { ownerSeconds: null, renterSeconds: 100 },
    ]);
    expect(ranked.map(({ place: candidate }) => candidate.name)).toEqual([
      "A",
      "C",
      "B",
    ]);
  });
});
