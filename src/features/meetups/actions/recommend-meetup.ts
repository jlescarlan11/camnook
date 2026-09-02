"use server";

import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isCalendarDate, isHandoffTime } from "../../bookings/calendar";
import { buildMeetupBinding } from "../binding";
import { cityInputSchema } from "../city-input";
import { buildDiscoverySeeds } from "../domain";
import {
  getMeetupProviderConfig,
  getMeetupRoutingConfig,
  getMeetupRoutingPolicyVersion,
} from "../config";
import { claimGeoapifyProviderBudget } from "../provider-budget";
import { GeoapifyAdapter, ProviderBoundaryError } from "../provider";
import { claimMapboxRoutingBudget } from "../routing-budget";
import { recommendPublicMeetup } from "../service";
import { recordMeetupTelemetry } from "../telemetry";
import type { SafeMeetupRecommendation } from "../types";

export type RecommendMeetupState = {
  error?:
    | "authentication"
    | "configuration"
    | "invalid_city"
    | "invalid_location"
    | "invalid_schedule"
    | "provider_unavailable"
    | "schedule_changed";
  recommendations?: SafeMeetupRecommendation[];
  status: "idle" | "error" | "success";
};

const contextSchema = z.object({
  camera_id: z.uuid(),
  city_label: z.string().min(2).max(120),
  country_code: z.literal("PH"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  policy_version: z.coerce.number().int().positive(),
  provider_city_id: z.string().min(2).max(240),
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
  const routingConfig = getMeetupRoutingConfig();
  const routingPolicyVersion = getMeetupRoutingPolicyVersion();
  if (!config || !routingPolicyVersion) {
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
  const adapter = new GeoapifyAdapter({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });
  if (mode === "manual") {
    const city = cityInputSchema.safeParse(value(formData, "manualCity"));
    if (!city.success) return { error: "invalid_city", status: "error" };
    manualCity = city.data;
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
    const canonical = z.object({
      active: z.literal(true), code: z.string(), current: z.literal(true), name: z.string().min(1),
      path: z.array(z.object({ name: z.string().min(1) })), release: z.string(),
      type: z.enum(["city", "municipality", "barangay"]),
    }).safeParse(resolution.data);
    if (resolution.error || !canonical.success) return { error: "invalid_location", status: "error" };
    if (!(await claimGeoapifyProviderBudget(context.user.id, 1))) {
      recordMeetupTelemetry({ durationBucket: "fast", providerBudgetStatus: "denied", providerRequestCount: 1, resultCount: 0, status: "quota" });
      return { error: "provider_unavailable", status: "error" };
    }
    try {
      const centroid = await adapter.geocodeAreaCentroid(`${canonical.data.path.map((area) => area.name).join(", ")}, Philippines`);
      renterCity = {
        countryCode: "PH" as const,
        label: canonical.data.name,
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        providerCityId: centroid.providerReference,
      };
    } catch {
      return { error: "provider_unavailable", status: "error" };
    }
  }

  if (manualCity && !(await claimGeoapifyProviderBudget(context.user.id, 1))) {
    recordMeetupTelemetry({ durationBucket: "fast", providerBudgetStatus: "denied", providerRequestCount: 1, resultCount: 0, status: "quota" });
    return { error: "provider_unavailable", status: "error" };
  }

  if (manualCity) {
    try {
      renterCity = await adapter.geocodeCity(manualCity);
    } catch (error) {
      return {
        error:
          error instanceof ProviderBoundaryError &&
          error.code === "unsupported_city"
            ? "invalid_city"
            : "provider_unavailable",
        status: "error",
      };
    }
  }

  const ownerOrigin = {
    latitude: parsedContext.data.latitude,
    longitude: parsedContext.data.longitude,
  };
  const renterOrigin = currentPosition ?? renterCity!;
  const discoveryRequestCount =
    buildDiscoverySeeds(ownerOrigin, renterOrigin).length *
      config.allowedCategories.length +
    (currentPosition ? 1 : 0);
  if (!(await claimGeoapifyProviderBudget(context.user.id, discoveryRequestCount))) {
    recordMeetupTelemetry({ durationBucket: "fast", providerBudgetStatus: "denied", providerRequestCount: discoveryRequestCount, resultCount: 0, status: "quota" });
    return { error: "provider_unavailable", status: "error" };
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
      renterCity,
    },
    {
      adapter,
      config,
      recordTelemetry: recordMeetupTelemetry,
      reserveRoutingBudget: (elementCount) =>
        claimMapboxRoutingBudget(context.user.id, elementCount),
      routingConfig,
      routingPolicyVersion,
    },
  );
  return result.status === "available"
    ? { recommendations: result.recommendations, status: "success" }
    : { error: "provider_unavailable", status: "error" };
}
