import { describe, expect, it } from "vitest";

import {
  calculateSearchCenter,
  coarseCoordinate,
  rankEligiblePlaces,
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
});
