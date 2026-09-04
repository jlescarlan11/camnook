import "server-only";

import {
  meetupRoutingConfigSchema,
  type MeetupProviderConfig,
  type MeetupRoutingConfig,
} from "./config";
import {
  calculateSearchCenter,
  buildDiscoverySeeds,
  coarseCoordinate,
  coordinateSchema,
  rankEligiblePlaces,
  rankPlacesByBalancedTravel,
  selectDiversePlaces,
  type Coordinate,
  type NormalizedCity,
  type PlaceTravelTime,
  type ProviderPlace,
} from "./domain";
import {
  GeoapifyAdapter,
  ProviderBoundaryError,
  type ProviderFailureCode,
} from "./provider";
import { mintRecommendationReference } from "./reference";
import {
  MapboxMatrixAdapter,
  RoutingBoundaryError,
  type RoutingBoundaryErrorCode,
} from "./routing-provider";
import type {
  MeetupRecommendationResult,
  MeetupUnavailableReason,
} from "./types";

export type RoutingTelemetryStatus =
  | "authentication"
  | "budget_denied"
  | "configuration"
  | "invalid_request"
  | "malformed"
  | "network"
  | "partial"
  | "quota"
  | "success"
  | "timeout"
  | "unavailable"
  | "unreachable";

export type MeetupProviderTelemetry = {
  candidateCount?: number;
  durationBucket: "fast" | "slow";
  elementCount?: number;
  fallbackEligible?: boolean;
  providerBudgetStatus?: "denied" | "reserved";
  providerRequestCount?: number;
  qualityRejectedCount?: number;
  profile?: "driving-traffic";
  resultCount: number;
  routingPolicyVersion?: string;
  routingStatus?: RoutingTelemetryStatus;
  seedCount?: number;
  status: "available" | MeetupUnavailableReason;
};

type RecommendInput = {
  binding: string;
  currentPosition?: Coordinate;
  lenderCity: NormalizedCity;
  providerLookupCount?: number;
  renterCity?: NormalizedCity;
};

type RecommendOptions = {
  adapter?: Pick<GeoapifyAdapter, "reverseGeocodeCity" | "searchPublicPlaces">;
  config: MeetupProviderConfig | null;
  now?: Date;
  recordTelemetry?: (event: MeetupProviderTelemetry) => void;
  reserveRoutingBudget?: (elementCount: number) => Promise<boolean>;
  routingAdapter?: Pick<MapboxMatrixAdapter, "calculateTravelTimes">;
  routingConfig: MeetupRoutingConfig | null;
  routingPolicyVersion: string;
};

const PROVIDER_REASON_MAP: Record<ProviderFailureCode, MeetupUnavailableReason> = {
  empty: "empty",
  malformed: "malformed",
  network: "network",
  quota: "quota",
  timeout: "timeout",
  unsupported_city: "unsupported_city",
};

const ROUTING_STATUS_MAP: Record<RoutingBoundaryErrorCode, RoutingTelemetryStatus> = {
  authentication: "authentication",
  invalid_request: "invalid_request",
  malformed: "malformed",
  network: "network",
  quota: "quota",
  timeout: "timeout",
  unavailable: "unavailable",
};

type RankedPlace = {
  place: ProviderPlace;
  travel: { ownerSeconds: number; renterSeconds: number } | null;
};

async function routeCandidates(
  candidates: ProviderPlace[],
  input: RecommendInput,
  options: RecommendOptions,
): Promise<{
  elementCount: number;
  ranked: RankedPlace[];
  routingStatus: RoutingTelemetryStatus;
}> {
  const fallback = candidates.slice(0, 5).map((place) => ({ place, travel: null }));
  const routingConfig = meetupRoutingConfigSchema.safeParse(options.routingConfig);
  if (!routingConfig.success) {
    return { elementCount: 0, ranked: fallback, routingStatus: "configuration" };
  }
  const bounded = candidates.slice(0, routingConfig.data.maxCandidates);
  const elementCount = bounded.length * 2;
  if (
    !options.reserveRoutingBudget ||
    !(await options.reserveRoutingBudget(elementCount))
  ) {
    return { elementCount, ranked: fallback, routingStatus: "budget_denied" };
  }

  const adapter =
    options.routingAdapter ?? new MapboxMatrixAdapter(routingConfig.data);
  try {
    const travelTimes = await adapter.calculateTravelTimes({
      ownerOrigin: input.lenderCity,
      renterOrigin: input.currentPosition ?? input.renterCity!,
      targets: bounded,
    });
    const ranked = rankPlacesByBalancedTravel(bounded, travelTimes);
    if (!ranked.length) {
      return { elementCount, ranked: fallback, routingStatus: "unreachable" };
    }
    const partial = travelTimes.some(
      (travel: PlaceTravelTime) =>
        travel.ownerSeconds === null || travel.renterSeconds === null,
    );
    return {
      elementCount,
      ranked: ranked.slice(0, 5),
      routingStatus: partial ? "partial" : "success",
    };
  } catch (error) {
    return {
      elementCount,
      ranked: fallback,
      routingStatus:
        error instanceof RoutingBoundaryError
          ? ROUTING_STATUS_MAP[error.code]
          : "malformed",
    };
  }
}

export async function recommendPublicMeetup(
  input: RecommendInput,
  options: RecommendOptions,
): Promise<MeetupRecommendationResult> {
  const startedAt = Date.now();
  if (!options.config) {
    options.recordTelemetry?.({
      durationBucket: "fast",
      resultCount: 0,
      status: "configuration",
    });
    return { reason: "configuration", status: "unavailable" };
  }
  const config = options.config;
  const position = input.currentPosition
    ? coordinateSchema.safeParse(input.currentPosition)
    : null;
  if ((!position?.success && !input.renterCity) || !input.binding.trim()) {
    options.recordTelemetry?.({
      durationBucket: "fast",
      resultCount: 0,
      status: "invalid_input",
    });
    return { reason: "invalid_input", status: "unavailable" };
  }

  const adapter =
    options.adapter ??
    new GeoapifyAdapter({ apiKey: config.apiKey, timeoutMs: config.timeoutMs });
  let resultCount = 0;
  try {
    const renterCity = input.renterCity
      ? input.renterCity
      : await adapter.reverseGeocodeCity(position!.success ? position!.data : input.lenderCity);
    const discoveryRenterOrigin = position?.success ? position.data : renterCity;
    const searchCenter = calculateSearchCenter(discoveryRenterOrigin, input.lenderCity);
    const discoverySeeds = buildDiscoverySeeds(
      input.lenderCity,
      discoveryRenterOrigin,
    );
    const seedResults = await Promise.all(discoverySeeds.map((center) =>
      adapter.searchPublicPlaces({
        allowedCategories: config.allowedCategories,
        center,
        radiusMeters: config.searchRadiusMeters,
      }),
    ));
    resultCount = seedResults.reduce((count, places) => count + places.length, 0);
    const merged = new Map<string, ProviderPlace>();
    for (const place of seedResults.flat()) {
      const current = merged.get(place.providerPlaceId);
      merged.set(place.providerPlaceId, current ? {
        ...current,
        categories: [...new Set([...current.categories, ...place.categories])],
      } : place);
    }
    const qualityEligible = rankEligiblePlaces(
      [...merged.values()],
      searchCenter,
      config.allowedCategories,
      {
        allowedLocalities: [input.lenderCity.label, renterCity.label],
        discoverySeeds,
        radiusMeters: config.searchRadiusMeters,
      },
    );
    const eligible = selectDiversePlaces(
      qualityEligible,
      config.allowedCategories,
      8,
    );
    if (!eligible.length) throw new ProviderBoundaryError("empty");

    const routed = await routeCandidates(eligible, input, options);
    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000).toISOString();
    const routeMode: "balanced" | "geoapify_fallback" =
      routed.routingStatus === "success" || routed.routingStatus === "partial"
        ? "balanced"
        : "geoapify_fallback";
    const recommendations = routed.ranked.map(({ place, travel }) => {
      const latitude = coarseCoordinate(place.latitude);
      const longitude = coarseCoordinate(place.longitude);
      const reference = mintRecommendationReference(
        {
          address: place.address,
          binding: input.binding,
          city: place.city,
          configVersion: config.configVersion,
          expiresAt,
          latitude,
          longitude,
          name: place.name,
          renterCity: { label: renterCity.label },
          routingPolicyVersion: options.routingPolicyVersion,
        },
        config.referenceSecret,
      );
      return {
        address: place.address,
        attribution: "© OpenStreetMap contributors · Powered by Geoapify" as const,
        city: place.city,
        configVersion: config.configVersion,
        expiresAt,
        latitude,
        longitude,
        name: place.name,
        ownerCity: input.lenderCity.label,
        ownerTravelMinutes: travel
          ? Math.max(1, Math.ceil(travel.ownerSeconds / 60))
          : null,
        routeEstimateApproximate: Boolean(input.renterCity && travel),
        routeMode,
        renterCity: renterCity.label,
        renterTravelMinutes: travel
          ? Math.max(1, Math.ceil(travel.renterSeconds / 60))
          : null,
        reference,
      };
    });
    options.recordTelemetry?.({
      candidateCount: eligible.length,
      durationBucket: Date.now() - startedAt < config.timeoutMs ? "fast" : "slow",
      elementCount: routed.elementCount,
      fallbackEligible: eligible.length > 0,
      providerBudgetStatus: "reserved",
      providerRequestCount:
        discoverySeeds.length * config.allowedCategories.length
        + (input.providerLookupCount ?? 0),
      profile: options.routingConfig?.profile,
      qualityRejectedCount: merged.size - qualityEligible.length,
      resultCount,
      routingPolicyVersion: options.routingPolicyVersion,
      routingStatus: routed.routingStatus,
      seedCount: discoverySeeds.length,
      status: "available",
    });
    return { recommendations, status: "available" };
  } catch (error) {
    const reason =
      error instanceof ProviderBoundaryError
        ? PROVIDER_REASON_MAP[error.code]
        : "malformed";
    options.recordTelemetry?.({
      durationBucket: Date.now() - startedAt < config.timeoutMs ? "fast" : "slow",
      resultCount,
      status: reason,
    });
    return { reason, status: "unavailable" };
  }
}
