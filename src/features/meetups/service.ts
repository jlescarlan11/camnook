import "server-only";

import type { MeetupProviderConfig } from "./config";
import {
  coarseCoordinate,
  coordinateSchema,
  calculateSearchCenter,
  rankEligiblePlaces,
  type Coordinate,
  type NormalizedCity,
} from "./domain";
import {
  GeoapifyAdapter,
  ProviderBoundaryError,
  type ProviderFailureCode,
} from "./provider";
import { mintRecommendationReference } from "./reference";
import type {
  MeetupRecommendationResult,
  MeetupUnavailableReason,
} from "./types";

export type MeetupProviderTelemetry = {
  durationBucket: "fast" | "slow";
  resultCount: number;
  status: "available" | MeetupUnavailableReason;
};

type RecommendInput = {
  binding: string;
  currentPosition?: Coordinate;
  lenderCity: NormalizedCity;
  renterCity?: NormalizedCity;
};

type RecommendOptions = {
  adapter?: Pick<GeoapifyAdapter, "reverseGeocodeCity" | "searchPublicPlaces">;
  config: MeetupProviderConfig | null;
  now?: Date;
  recordTelemetry?: (event: MeetupProviderTelemetry) => void;
};

const PROVIDER_REASON_MAP: Record<ProviderFailureCode, MeetupUnavailableReason> = {
  empty: "empty",
  malformed: "malformed",
  network: "network",
  quota: "quota",
  timeout: "timeout",
  unsupported_city: "unsupported_city",
};

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
    new GeoapifyAdapter({
      apiKey: options.config.apiKey,
      timeoutMs: options.config.timeoutMs,
    });

  let resultCount = 0;
  try {
    // The exact browser coordinate is intentionally not copied into any durable
    // state or output. Only the city-level provider result survives this call.
    const renterCity = input.renterCity
      ? input.renterCity
      : await adapter.reverseGeocodeCity(position!.success ? position!.data : input.lenderCity);
    const searchCenter = calculateSearchCenter(renterCity, input.lenderCity);
    const candidates = await adapter.searchPublicPlaces({
      allowedCategories: options.config.allowedCategories,
      center: searchCenter,
      radiusMeters: options.config.searchRadiusMeters,
    });
    resultCount = candidates.length;
    const winner = rankEligiblePlaces(
      candidates,
      searchCenter,
      options.config.allowedCategories,
    )[0];
    if (!winner) throw new ProviderBoundaryError("empty");

    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000).toISOString();
    const safeLatitude = coarseCoordinate(winner.latitude);
    const safeLongitude = coarseCoordinate(winner.longitude);
    const reference = mintRecommendationReference(
      {
        address: winner.address,
        binding: input.binding,
        city: winner.city,
        configVersion: options.config.configVersion,
        expiresAt,
        latitude: safeLatitude,
        longitude: safeLongitude,
        name: winner.name,
        renterCity: {
          label: renterCity.label,
        },
      },
      options.config.referenceSecret,
    );
    options.recordTelemetry?.({
      durationBucket: Date.now() - startedAt < options.config.timeoutMs ? "fast" : "slow",
      resultCount,
      status: "available",
    });
    return {
      recommendation: {
        address: winner.address,
        attribution: "© OpenStreetMap contributors · Powered by Geoapify",
        city: winner.city,
        configVersion: options.config.configVersion,
        expiresAt,
        latitude: safeLatitude,
        longitude: safeLongitude,
        name: winner.name,
        renterCity: renterCity.label,
        reference,
      },
      status: "available",
    };
  } catch (error) {
    const reason =
      error instanceof ProviderBoundaryError
        ? PROVIDER_REASON_MAP[error.code]
        : "malformed";
    options.recordTelemetry?.({
      durationBucket: Date.now() - startedAt < options.config.timeoutMs ? "fast" : "slow",
      resultCount,
      status: reason,
    });
    return { reason, status: "unavailable" };
  }
}
