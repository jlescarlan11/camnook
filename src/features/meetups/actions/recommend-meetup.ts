"use server";

import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isCalendarDate, isHandoffTime } from "../../bookings/calendar";
import { buildMeetupBinding } from "../binding";
import { cityInputSchema } from "../city-input";
import { getMeetupProviderConfig } from "../config";
import { claimGeoapifyProviderBudget } from "../provider-budget";
import { GeoapifyAdapter, ProviderBoundaryError } from "../provider";
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
  recommendation?: SafeMeetupRecommendation;
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
    (mode !== "current" && mode !== "manual")
  ) {
    return { error: "invalid_schedule", status: "error" };
  }

  const context = await getAuthenticatedUser();
  if (!context) return { error: "authentication", status: "error" };
  const config = getMeetupProviderConfig();
  if (!config) return { error: "configuration", status: "error" };

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

  const adapter = new GeoapifyAdapter({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });
  let renterCity;
  let currentPosition;
  if (mode === "manual") {
    const city = cityInputSchema.safeParse(value(formData, "manualCity"));
    if (!city.success) return { error: "invalid_city", status: "error" };
    try {
      renterCity = await adapter.geocodeCity(city.data);
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
  } else {
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
  }

  if (!(await claimGeoapifyProviderBudget(
    context.user.id,
    config.allowedCategories.length + 1,
  ))) {
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
  });
  const result = await recommendPublicMeetup(
    {
      binding,
      currentPosition,
      lenderCity: {
        countryCode: "PH",
        label: parsedContext.data.city_label,
        latitude: parsedContext.data.latitude,
        longitude: parsedContext.data.longitude,
        providerCityId: parsedContext.data.provider_city_id,
      },
      renterCity,
    },
    { adapter, config, recordTelemetry: recordMeetupTelemetry },
  );
  return result.status === "available"
    ? { recommendation: result.recommendation, status: "success" }
    : { error: "provider_unavailable", status: "error" };
}
