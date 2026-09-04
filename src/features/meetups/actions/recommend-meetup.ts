"use server";

import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isCalendarDate, isHandoffTime } from "../../bookings/calendar";
import { buildCanonicalAreaBinding, buildMeetupBinding } from "../binding";
import { cityInputSchema } from "../city-input";
import { buildDiscoverySeeds } from "../domain";
import {
  getMeetupProviderConfig,
  getMeetupReferenceSecret,
  getMeetupRoutingConfig,
  getMeetupRoutingPolicyVersion,
} from "../config";
import { claimGeoapifyProviderBudget } from "../provider-budget";
import { GeoapifyAdapter, ProviderBoundaryError } from "../provider";
import { claimMapboxRoutingBudget } from "../routing-budget";
import { recommendPublicMeetup } from "../service";
import { recordMeetupTelemetry } from "../telemetry";
import { mintCanonicalAreaReference } from "../reference";
import type {
  SafeCanonicalMeetupArea,
  SafeMeetupRecommendation,
} from "../types";

export type RecommendMeetupState = {
  canonicalArea?: SafeCanonicalMeetupArea;
  error?:
    | "authentication"
    | "configuration"
    | "invalid_city"
    | "invalid_location"
    | "invalid_schedule"
    | "no_eligible_places"
    | "provider_unavailable"
    | "rate_limited"
    | "schedule_changed";
  recommendations?: SafeMeetupRecommendation[];
  status: "idle" | "error" | "success";
  warning?:
    | "configuration"
    | "no_eligible_places"
    | "provider_unavailable"
    | "rate_limited";
};

type RecommendationFailure =
  | "configuration"
  | "no_eligible_places"
  | "provider_unavailable"
  | "rate_limited";

function safeRecommendationFailure(
  reason:
    | "configuration"
    | "empty"
    | "invalid_input"
    | "malformed"
    | "network"
    | "quota"
    | "timeout"
    | "unsupported_city",
): RecommendationFailure {
  if (reason === "configuration") return "configuration";
  if (reason === "empty") return "no_eligible_places";
  if (reason === "quota") return "rate_limited";
  return "provider_unavailable";
}

function unavailableRecommendation(
  error: RecommendationFailure,
  canonicalArea?: SafeCanonicalMeetupArea,
): RecommendMeetupState {
  return canonicalArea
    ? { canonicalArea, status: "success", warning: error }
    : { error, status: "error" };
}

const contextSchema = z.object({
  camera_id: z.uuid(),
  city_label: z.string().min(2).max(120),
  country_code: z.literal("PH"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  policy_version: z.coerce.number().int().positive(),
  provider_city_id: z.string().min(2).max(240),
});

const canonicalAreaSchema = z.object({
  active: z.literal(true),
  code: z.string().regex(/^\d{10}$/),
  current: z.literal(true),
  name: z.string().min(1).max(160),
  path: z.array(z.object({
    code: z.string().regex(/^\d{10}$/),
    name: z.string().min(1).max(160),
    type: z.enum([
      "region",
      "province",
      "city",
      "municipality",
      "submunicipality",
      "barangay",
    ]),
  })),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  type: z.literal("barangay"),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function recommendMeetup(
  _previous: RecommendMeetupState,
  formData: FormData,
): Promise<RecommendMeetupState> {
  const cameraId = value(formData, "camera");
  const pickupDate = value(formData, "pickupDate");
  const returnDate = value(formData, "returnDate");
  const handoffTime = value(formData, "handoffTime");
  const policyVersionValue = value(formData, "policyVersion");
  const policyVersion = Number(policyVersionValue);
  const mode = value(formData, "locationMode");
  if (
    !z.uuid().safeParse(cameraId).success ||
    !isCalendarDate(pickupDate) ||
    !isCalendarDate(returnDate) ||
    !isHandoffTime(handoffTime) ||
    !/^\d+$/.test(policyVersionValue) ||
    !Number.isSafeInteger(policyVersion) ||
    policyVersion < 1 ||
    !["current", "manual", "saved", "canonical"].includes(mode)
  ) {
    return { error: "invalid_schedule", status: "error" };
  }

  const context = await getAuthenticatedUser();
  if (!context) return { error: "authentication", status: "error" };
  const config = getMeetupProviderConfig();
  const referenceSecret = getMeetupReferenceSecret();
  const routingConfig = getMeetupRoutingConfig();
  const routingPolicyVersion = getMeetupRoutingPolicyVersion();
  if (!referenceSecret || !routingPolicyVersion) {
    return { error: "configuration", status: "error" };
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { error: "configuration", status: "error" };
  }
  const recommendationContext = await admin
    .schema("api")
    .rpc("get_meetup_recommendation_context", {
      p_camera_id: cameraId,
      p_handoff_time: handoffTime,
      p_pickup_date: pickupDate,
      p_policy_version: policyVersion,
      p_return_date: returnDate,
    });
  const parsedContext = contextSchema.safeParse(recommendationContext.data);
  if (recommendationContext.error || !parsedContext.success) {
    return {
      error:
        recommendationContext.error?.code === "40001" ||
        recommendationContext.error?.code === "23P01"
          ? "schedule_changed"
          : "invalid_schedule",
      status: "error",
    };
  }

  let renterCity;
  let currentPosition;
  let manualCity;
  let canonicalArea: SafeCanonicalMeetupArea | undefined;
  let providerBudgetReserved = false;
  let providerLookupCount = 0;
  const now = new Date();
  const adapter = config
    ? new GeoapifyAdapter({
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      })
    : null;
  const ownerOrigin = {
    latitude: parsedContext.data.latitude,
    longitude: parsedContext.data.longitude,
  };
  if (mode === "manual") {
    const city = cityInputSchema.safeParse(value(formData, "manualCity"));
    if (!city.success) return { error: "invalid_city", status: "error" };
    manualCity = city.data;
    providerLookupCount = 1;
  } else if (mode === "current") {
    const location = z
      .object({
        accuracy: z.coerce.number().finite().nonnegative().max(50_000),
        latitude: z.coerce.number().finite().min(-90).max(90),
        longitude: z.coerce.number().finite().min(-180).max(180),
      })
      .safeParse({
        accuracy: value(formData, "accuracy"),
        latitude: value(formData, "latitude"),
        longitude: value(formData, "longitude"),
      });
    if (!location.success) {
      return { error: "invalid_location", status: "error" };
    }
    currentPosition = {
      latitude: location.data.latitude,
      longitude: location.data.longitude,
    };
    providerLookupCount = 1;
  } else if (mode === "saved") {
    const saved = await context.supabase.schema("api").rpc("get_my_meetup_origin_for_routing");
    const parsedSaved = z.object({
      active: z.literal(true),
      area_code: z.string().regex(/^\d{10}$/),
      area_name: z.string().min(1).max(160),
      current: z.literal(true),
      latitude: z.coerce.number().min(4).max(22),
      longitude: z.coerce.number().min(116).max(127),
      precision: z.enum(["city_centroid", "barangay_centroid", "precise"]),
      release: z.string().regex(/^\d{4}-q[1-4]$/),
    }).safeParse(saved.data);
    if (saved.error || !parsedSaved.success) return { error: "invalid_location", status: "error" };
    canonicalArea = {
      areaCode: parsedSaved.data.area_code,
      areaLabel: parsedSaved.data.area_name,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1_000).toISOString(),
      path: [],
      reference: mintCanonicalAreaReference({
        areaCode: parsedSaved.data.area_code,
        areaLabel: parsedSaved.data.area_name,
        binding: buildCanonicalAreaBinding({
          cameraId,
          handoffTime,
          pickupDate,
          policyVersion,
          renterId: context.user.id,
          returnDate,
        }),
        expiresAt: new Date(now.getTime() + 15 * 60 * 1_000).toISOString(),
        kind: "canonical_area",
        release: parsedSaved.data.release,
      }, referenceSecret),
      release: parsedSaved.data.release,
    };
    renterCity = {
      countryCode: "PH" as const,
      label: parsedSaved.data.area_name,
      latitude: parsedSaved.data.latitude,
      longitude: parsedSaved.data.longitude,
      providerCityId: `psgc:${parsedSaved.data.release}:${parsedSaved.data.area_code}`,
    };
  } else {
    const canonicalInput = z.object({
      areaCode: z.string().regex(/^\d{10}$/),
      release: z.string().regex(/^\d{4}-q[1-4]$/),
    }).safeParse({ areaCode: value(formData, "psgcAreaCode"), release: value(formData, "psgcRelease") });
    if (!canonicalInput.success) return { error: "invalid_location", status: "error" };
    const resolution = await context.supabase.schema("api").rpc("resolve_psgc_area", {
      p_area_code: canonicalInput.data.areaCode,
      p_release_key: canonicalInput.data.release,
    });
    const canonical = canonicalAreaSchema.safeParse(resolution.data);
    if (resolution.error || !canonical.success) return { error: "invalid_location", status: "error" };
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000).toISOString();
    canonicalArea = {
      areaCode: canonical.data.code,
      areaLabel: canonical.data.name,
      expiresAt,
      path: canonical.data.path,
      reference: mintCanonicalAreaReference({
        areaCode: canonical.data.code,
        areaLabel: canonical.data.name,
        binding: buildCanonicalAreaBinding({
          cameraId,
          handoffTime,
          pickupDate,
          policyVersion,
          renterId: context.user.id,
          returnDate,
        }),
        expiresAt,
        kind: "canonical_area",
        release: canonical.data.release,
      }, referenceSecret),
      release: canonical.data.release,
    };
    if (!config) {
      return { canonicalArea, status: "success", warning: "configuration" };
    }
    providerLookupCount = 1;
    const completeRequestCount = 1 + config.allowedCategories.length;
    if (!(await claimGeoapifyProviderBudget(context.user.id, completeRequestCount))) {
      recordMeetupTelemetry({
        durationBucket: "fast",
        providerBudgetStatus: "denied",
        providerRequestCount: completeRequestCount,
        resultCount: 0,
        status: "quota",
      });
      return { canonicalArea, status: "success", warning: "rate_limited" };
    }
    providerBudgetReserved = true;
    try {
      const centroid = await adapter!.geocodeAreaCentroid({
        expectedAreaNames: canonical.data.path
          .filter((area) => area.type !== "region")
          .map((area) => area.name),
        query: `${canonical.data.path.map((area) => area.name).join(", ")}, Philippines`,
      });
      renterCity = {
        countryCode: "PH" as const,
        label: canonical.data.name,
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        providerCityId: centroid.providerReference,
      };
    } catch {
      return { canonicalArea, status: "success", warning: "provider_unavailable" };
    }
  }

  if (!config) {
    return unavailableRecommendation("configuration", canonicalArea);
  }
  const knownRenterOrigin = currentPosition ?? renterCity;
  const providerRequestCount = knownRenterOrigin
    ? buildDiscoverySeeds(ownerOrigin, knownRenterOrigin).length *
        config.allowedCategories.length +
      (currentPosition ? 1 : 0)
    : 1 + config.allowedCategories.length;
  if (
    !providerBudgetReserved &&
    !(await claimGeoapifyProviderBudget(context.user.id, providerRequestCount))
  ) {
    recordMeetupTelemetry({
      durationBucket: "fast",
      providerBudgetStatus: "denied",
      providerRequestCount,
      resultCount: 0,
      status: "quota",
    });
    return unavailableRecommendation("rate_limited", canonicalArea);
  }

  if (manualCity) {
    try {
      renterCity = await adapter!.geocodeCity(manualCity);
    } catch (error) {
      if (error instanceof ProviderBoundaryError) {
        if (error.code === "unsupported_city") {
          return { error: "invalid_city", status: "error" };
        }
        return unavailableRecommendation(safeRecommendationFailure(error.code));
      }
      return unavailableRecommendation("provider_unavailable");
    }
  }

  const binding = buildMeetupBinding({
    cameraId,
    configVersion: config.configVersion,
    handoffTime,
    pickupDate,
    policyVersion,
    renterId: context.user.id,
    returnDate,
    routingPolicyVersion,
  });
  const result = await recommendPublicMeetup(
    {
      binding,
      currentPosition,
      lenderCity: {
        countryCode: "PH",
        label: parsedContext.data.city_label,
        ...ownerOrigin,
        providerCityId: parsedContext.data.provider_city_id,
      },
      providerLookupCount,
      renterCity,
    },
    {
      adapter: adapter!,
      config,
      recordTelemetry: recordMeetupTelemetry,
      reserveRoutingBudget: (elementCount) =>
        claimMapboxRoutingBudget(context.user.id, elementCount),
      routingConfig,
      routingPolicyVersion,
      now,
    },
  );
  return result.status === "available"
    ? {
        canonicalArea,
        recommendations: result.recommendations,
        status: "success",
      }
    : unavailableRecommendation(
        safeRecommendationFailure(result.reason),
        canonicalArea,
      );
}
