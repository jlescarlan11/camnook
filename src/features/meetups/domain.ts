import { z } from "zod";

export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export type Coordinate = z.infer<typeof coordinateSchema>;

export type NormalizedCity = Coordinate & {
  countryCode: "PH";
  label: string;
  providerCityId: string;
};

export type ProviderAddressSuggestion = Coordinate & {
  address: string;
  city: string;
  providerAddressId: string;
};

export type ProviderAreaCentroid = Coordinate & {
  providerReference: string;
};

export type ProviderPlace = Coordinate & {
  address: string;
  categories: string[];
  city: string;
  name: string;
  providerPlaceId: string;
};

export type PlaceTravelTime = {
  ownerSeconds: number | null;
  renterSeconds: number | null;
};

const FORBIDDEN_CATEGORY_PREFIXES = [
  "accommodation",
  "building.residential",
  "populated_place",
] as const;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

export function calculateSearchCenter(
  renterCity: Coordinate,
  lenderCity: Coordinate,
): Coordinate {
  const first = coordinateSchema.parse(renterCity);
  const second = coordinateSchema.parse(lenderCity);
  const latitude1 = toRadians(first.latitude);
  const longitude1 = toRadians(first.longitude);
  const latitude2 = toRadians(second.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const bx = Math.cos(latitude2) * Math.cos(deltaLongitude);
  const by = Math.cos(latitude2) * Math.sin(deltaLongitude);
  const latitude = Math.atan2(
    Math.sin(latitude1) + Math.sin(latitude2),
    Math.sqrt((Math.cos(latitude1) + bx) ** 2 + by ** 2),
  );
  const longitude = longitude1 + Math.atan2(by, Math.cos(latitude1) + bx);

  return {
    latitude: Number(toDegrees(latitude).toFixed(6)),
    longitude: Number(
      ((((toDegrees(longitude) + 540) % 360) - 180)).toFixed(6),
    ),
  };
}

export function buildDiscoverySeeds(
  ownerOrigin: Coordinate,
  renterOrigin: Coordinate,
): Coordinate[] {
  const values = [
    coordinateSchema.parse(ownerOrigin),
    coordinateSchema.parse(renterOrigin),
    calculateSearchCenter(ownerOrigin, renterOrigin),
  ];
  const unique = new Map<string, Coordinate>();
  for (const value of values) {
    unique.set(`${value.latitude.toFixed(6)}:${value.longitude.toFixed(6)}`, value);
  }
  return [...unique.values()];
}

function distanceMeters(first: Coordinate, second: Coordinate) {
  const earthRadius = 6_371_000;
  const deltaLatitude = toRadians(second.latitude - first.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const latitude1 = toRadians(first.latitude);
  const latitude2 = toRadians(second.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function normalizedText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedLocality(value: string) {
  return normalizedText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/^city of\s+/u, "")
    .replace(/\s+city$/u, "")
    .replace(/^municipality of\s+/u, "")
    .replace(/\s+municipality$/u, "");
}

export function rankEligiblePlaces(
  places: ProviderPlace[],
  searchCenter: Coordinate,
  allowedCategories: readonly string[],
  quality?: {
    allowedLocalities?: readonly string[];
    discoverySeeds: readonly Coordinate[];
    radiusMeters: number;
  },
): ProviderPlace[] {
  const allowlist = new Set(allowedCategories);
  const categoryPriority = new Map(
    allowedCategories.map((category, index) => [category, index]),
  );

  return places
    .filter((place) => {
      if (
        !place.name.trim() ||
        !place.address.trim() ||
        !place.city.trim() ||
        !place.providerPlaceId.trim()
      ) {
        return false;
      }
      if (/^(?:[a-z]?\d+[a-z]?|route\s+\d+|road\s+\d+|unnamed(?:\s+(?:building|place|road))?)$/iu.test(place.name.trim())) {
        return false;
      }
      if (
        quality &&
        !quality.discoverySeeds.some(
          (seed) => distanceMeters(place, seed) <= quality.radiusMeters,
        )
      ) {
        return false;
      }
      if (
        quality?.allowedLocalities?.length &&
        !quality.allowedLocalities.some(
          (locality) => normalizedLocality(locality) === normalizedLocality(place.city),
        )
      ) {
        return false;
      }
      if (
        place.categories.some((category) =>
          FORBIDDEN_CATEGORY_PREFIXES.some(
            (prefix) => category === prefix || category.startsWith(`${prefix}.`),
          ),
        )
      ) {
        return false;
      }
      return place.categories.some((category) => allowlist.has(category));
    })
    .map((place) => ({
      ...place,
      address: normalizedText(place.address),
      city: normalizedText(place.city),
      name: normalizedText(place.name),
    }))
    .filter(
      (place, index, normalized) =>
        normalized.findIndex(
          (candidate) =>
            candidate.providerPlaceId === place.providerPlaceId ||
            (candidate.latitude === place.latitude &&
              candidate.longitude === place.longitude &&
              candidate.name === place.name &&
              candidate.address === place.address),
        ) === index,
    )
    .sort((first, second) => {
      const distanceDifference =
        distanceMeters(first, searchCenter) -
        distanceMeters(second, searchCenter);
      if (Math.abs(distanceDifference) >= 0.01) return distanceDifference;

      const firstCategory = Math.min(
        ...first.categories
          .filter((category) => allowlist.has(category))
          .map((category) => categoryPriority.get(category) ?? Number.MAX_VALUE),
      );
      const secondCategory = Math.min(
        ...second.categories
          .filter((category) => allowlist.has(category))
          .map((category) => categoryPriority.get(category) ?? Number.MAX_VALUE),
      );
      if (firstCategory !== secondCategory) return firstCategory - secondCategory;

      return (
        first.name.localeCompare(second.name, "en") ||
        first.address.localeCompare(second.address, "en") ||
        first.providerPlaceId.localeCompare(second.providerPlaceId, "en")
      );
    });
}

export function rankPlacesByBalancedTravel(
  places: ProviderPlace[],
  travelTimes: PlaceTravelTime[],
) {
  if (places.length !== travelTimes.length) return [];
  return places
    .map((place, index) => ({ place, travel: travelTimes[index], tieIndex: index }))
    .filter(
      (candidate): candidate is {
        place: ProviderPlace;
        travel: { ownerSeconds: number; renterSeconds: number };
        tieIndex: number;
      } =>
        candidate.travel?.ownerSeconds !== null &&
        candidate.travel?.ownerSeconds !== undefined &&
        candidate.travel?.renterSeconds !== null &&
        candidate.travel?.renterSeconds !== undefined,
    )
    .sort((first, second) => {
      const firstMaximum = Math.max(
        first.travel.ownerSeconds,
        first.travel.renterSeconds,
      );
      const secondMaximum = Math.max(
        second.travel.ownerSeconds,
        second.travel.renterSeconds,
      );
      return (
        firstMaximum - secondMaximum ||
        first.travel.ownerSeconds + first.travel.renterSeconds -
          (second.travel.ownerSeconds + second.travel.renterSeconds) ||
        first.tieIndex - second.tieIndex
      );
    });
}

export function coarseCoordinate(value: number) {
  return Number(value.toFixed(3));
}
