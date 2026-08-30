"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  isAdminAuthorizationError,
  isAuthenticationError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";

import { getMeetupProviderConfig } from "../meetups/config";
import { cityInputSchema } from "../meetups/city-input";
import { coarseCoordinate } from "../meetups/domain";
import { GeoapifyAdapter, ProviderBoundaryError } from "../meetups/provider";
import { claimGeoapifyProviderBudget } from "../meetups/provider-budget";
import {
  mintHandoffCityReference,
  readHandoffCityReference,
} from "./handoff-city-reference";

export type SaveHandoffPolicyState = {
  error?: "invalid_input" | "save_failed" | "stale" | "unauthorized";
  fieldErrors?: Partial<
    Record<
      | "approvedTimes"
      | "camera"
      | "city"
      | "weekdays",
      string
    >
  >;
  status: "error" | "idle" | "success";
  cityLabel?: string;
  version?: number;
};

export type SuggestHandoffCityState = {
  error?:
    | "configuration"
    | "invalid_city"
    | "invalid_context"
    | "invalid_location"
    | "provider_unavailable"
    | "stale"
    | "unauthorized";
  status: "error" | "idle" | "success";
  suggestion?: {
    cityLabel: string;
    expectedVersion: number;
    expiresAt: string;
    reference: string;
  };
};

export type SuggestHandoffAddressState = {
  error?:
    | "configuration"
    | "invalid_address"
    | "invalid_context"
    | "provider_unavailable"
    | "stale"
    | "unauthorized";
  query?: string;
  status: "error" | "idle" | "success";
  suggestions?: Array<{
    addressLabel: string;
    cityLabel: string;
    expectedVersion: number;
    expiresAt: string;
    reference: string;
  }>;
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const baseSchema = z.object({
  cameraId: z.uuid(),
  expectedVersion: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().nonnegative().safe()),
});

const adminPolicyAnchorSchema = z.object({
  city_label: z.string().trim().min(2).max(120).nullable(),
  country_code: z.literal("PH").nullable(),
  latitude: z.coerce.number().finite().min(-90).max(90).nullable(),
  longitude: z.coerce.number().finite().min(-180).max(180).nullable(),
  provider_city_id: z.string().trim().min(2).max(240).nullable(),
  version: z.coerce.number().int().nonnegative(),
});

const numericInput = (minimum: number, maximum: number) =>
  z.preprocess(
    (input) =>
      typeof input === "string" && input.trim() ? Number(input) : Number.NaN,
    z.number().finite().min(minimum).max(maximum),
  );

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

async function loadCurrentAnchor(
  context: Awaited<ReturnType<typeof requireUser>>,
  cameraId: string,
): Promise<
  | { data: z.infer<typeof adminPolicyAnchorSchema>; status: "success" }
  | { status: "error" }
  | { status: "unauthorized" }
> {
  try {
    const result = await context.supabase
      .schema("api")
      .rpc("get_camera_handoff_policy_admin", { p_camera_id: cameraId });
    const parsed = adminPolicyAnchorSchema.safeParse(result.data);
    if (isAdminAuthorizationError(result.error)) {
      return { status: "unauthorized" };
    }
    return result.error || !parsed.success
      ? { status: "error" }
      : { data: parsed.data, status: "success" };
  } catch {
    return { status: "error" };
  }
}

export async function suggestHandoffCity(
  _previous: SuggestHandoffCityState,
  formData: FormData,
): Promise<SuggestHandoffCityState> {
  const contextInput = z
    .object({
      cameraId: z.uuid(),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative().safe()),
      locationMode: z.enum(["current", "manual"]),
    })
    .safeParse({
      cameraId: value(formData, "cameraId"),
      expectedVersion: value(formData, "expectedVersion"),
      locationMode: value(formData, "locationMode"),
    });
  if (!contextInput.success) {
    return { error: "invalid_context", status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch {
    return { error: "unauthorized", status: "error" };
  }

  const current = await loadCurrentAnchor(context, contextInput.data.cameraId);
  if (current.status === "unauthorized") {
    return { error: "unauthorized", status: "error" };
  }
  if (current.status === "error") {
    return { error: "invalid_context", status: "error" };
  }
  if (current.data.version !== contextInput.data.expectedVersion) {
    return { error: "stale", status: "error" };
  }

  const config = getMeetupProviderConfig();
  if (!config) return { error: "configuration", status: "error" };

  const cityInput =
    contextInput.data.locationMode === "manual"
      ? cityInputSchema.safeParse(value(formData, "manualCity"))
      : z
          .object({
            accuracy: numericInput(0, 50_000),
            latitude: numericInput(-90, 90),
            longitude: numericInput(-180, 180),
          })
          .safeParse({
            accuracy: value(formData, "accuracy"),
            latitude: value(formData, "latitude"),
            longitude: value(formData, "longitude"),
          });
  if (!cityInput.success) {
    return {
      error:
        contextInput.data.locationMode === "manual"
          ? "invalid_city"
          : "invalid_location",
      status: "error",
    };
  }

  if (!(await claimGeoapifyProviderBudget(context.user.id, 1))) {
    return { error: "provider_unavailable", status: "error" };
  }
  const adapter = new GeoapifyAdapter({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  let city;
  try {
    if (typeof cityInput.data === "string") {
      city = await adapter.geocodeCity(cityInput.data);
    } else {
      city = await adapter.reverseGeocodeCity({
        latitude: cityInput.data.latitude,
        longitude: cityInput.data.longitude,
      });
    }
  } catch (error) {
    if (
      error instanceof ProviderBoundaryError &&
      error.code === "unsupported_city"
    ) {
      return {
        error:
          contextInput.data.locationMode === "manual"
            ? "invalid_city"
            : "invalid_location",
        status: "error",
      };
    }
    return { error: "provider_unavailable", status: "error" };
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1_000).toISOString();
  const reference = mintHandoffCityReference(
    {
      actorId: context.user.id,
      cameraId: contextInput.data.cameraId,
      city,
      configVersion: config.configVersion,
      expectedVersion: contextInput.data.expectedVersion,
      expiresAt,
    },
    config.referenceSecret,
  );
  return {
    status: "success",
    suggestion: {
      cityLabel: city.label,
      expectedVersion: contextInput.data.expectedVersion,
      expiresAt,
      reference,
    },
  };
}

export async function suggestHandoffAddress(
  _previous: SuggestHandoffAddressState,
  formData: FormData,
): Promise<SuggestHandoffAddressState> {
  const input = z
    .object({
      cameraId: z.uuid(),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative().safe()),
      query: z
        .string()
        .trim()
        .min(3)
        .max(120)
        .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)),
    })
    .safeParse({
      cameraId: value(formData, "cameraId"),
      expectedVersion: value(formData, "expectedVersion"),
      query: value(formData, "addressQuery"),
    });
  if (!input.success) return { error: "invalid_address", status: "error" };

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch {
    return { error: "unauthorized", status: "error" };
  }

  const current = await loadCurrentAnchor(context, input.data.cameraId);
  if (current.status === "unauthorized") {
    return { error: "unauthorized", status: "error" };
  }
  if (current.status === "error") {
    return { error: "invalid_context", status: "error" };
  }
  if (current.data.version !== input.data.expectedVersion) {
    return { error: "stale", status: "error" };
  }

  const config = getMeetupProviderConfig();
  if (!config) return { error: "configuration", status: "error" };

  if (!(await claimGeoapifyProviderBudget(context.user.id, 1))) {
    return {
      error: "provider_unavailable",
      query: input.data.query,
      status: "error",
    };
  }

  const adapter = new GeoapifyAdapter({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });

  let addressSuggestions;
  try {
    addressSuggestions = await adapter.searchAddressSuggestions(input.data.query);
  } catch {
    return {
      error: "provider_unavailable",
      query: input.data.query,
      status: "error",
    };
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1_000).toISOString();
  return {
    query: input.data.query,
    status: "success",
    suggestions: addressSuggestions.map((addressSuggestion) => ({
      addressLabel: addressSuggestion.address,
      cityLabel: addressSuggestion.city,
      expectedVersion: input.data.expectedVersion,
      expiresAt,
      reference: mintHandoffCityReference(
        {
          actorId: context.user.id,
          cameraId: input.data.cameraId,
          city: {
            countryCode: "PH",
            label: addressSuggestion.city,
            latitude: coarseCoordinate(addressSuggestion.latitude),
            longitude: coarseCoordinate(addressSuggestion.longitude),
            providerCityId: addressSuggestion.providerAddressId,
          },
          configVersion: config.configVersion,
          expectedVersion: input.data.expectedVersion,
          expiresAt,
        },
        config.referenceSecret,
      ),
    })),
  };
}

function uniqueValues<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export async function saveCameraHandoffPolicy(
  _state: SaveHandoffPolicyState,
  formData: FormData,
): Promise<SaveHandoffPolicyState> {
  const base = baseSchema.safeParse({
    cameraId: formData.get("cameraId"),
    expectedVersion: formData.get("expectedVersion"),
  });
  const enabled = formData.get("enabled") === "on";
  const weekdays = formData
    .getAll("weekdays")
    .map(String)
    .map(Number);
  const approvedTimes = String(formData.get("approvedTimes") ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const fieldErrors: SaveHandoffPolicyState["fieldErrors"] = {};

  if (!base.success) {
    const flattened = z.flattenError(base.error).fieldErrors;
    if (flattened.cameraId || flattened.expectedVersion) {
      fieldErrors.camera = "Reload this camera before saving.";
    }
  }

  if (
    weekdays.some((value) => !Number.isInteger(value) || value < 0 || value > 6) ||
    !uniqueValues(weekdays) ||
    (enabled && weekdays.length === 0)
  ) {
    fieldErrors.weekdays = "Choose at least one unique handoff weekday.";
  }
  if (
    approvedTimes.length > 24 ||
    approvedTimes.some((value) => !timePattern.test(value)) ||
    !uniqueValues(approvedTimes) ||
    (enabled && approvedTimes.length === 0)
  ) {
    fieldErrors.approvedTimes =
      "Enter unique 24-hour times as HH:MM, separated by spaces, commas, or lines.";
  }

  if (!base.success || Object.keys(fieldErrors).length > 0) {
    return { error: "invalid_input", fieldErrors, status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch (error) {
    return {
      error: isAuthenticationError(error) ? "unauthorized" : "save_failed",
      status: "error",
    };
  }

  const reference = value(formData, "cityReference");
  let cityAnchor:
    | {
        countryCode: "PH";
        label: string;
        latitude: number;
        longitude: number;
        providerCityId: string;
      }
    | undefined;
  if (reference) {
    const config = getMeetupProviderConfig();
    if (!config) {
      return {
        error: "invalid_input",
        fieldErrors: { city: "Confirm the handoff city again before saving." },
        status: "error",
      };
    }
    const claims = readHandoffCityReference(reference, config.referenceSecret, {
      actorId: context.user.id,
      cameraId: base.data.cameraId,
      configVersion: config.configVersion,
      expectedVersion: base.data.expectedVersion,
    });
    if (!claims) {
      return {
        error: "invalid_input",
        fieldErrors: { city: "Confirm the handoff city again before saving." },
        status: "error",
      };
    }
    cityAnchor = claims.city;
  } else {
    const current = await loadCurrentAnchor(context, base.data.cameraId);
    if (current.status === "unauthorized") {
      return { error: "unauthorized", status: "error" };
    }
    if (current.status === "error") {
      return { error: "save_failed", status: "error" };
    }
    if (current.data.version !== base.data.expectedVersion) {
      return { error: "stale", status: "error" };
    }
    if (
      !current.data.city_label ||
      !current.data.country_code ||
      current.data.latitude === null ||
      current.data.longitude === null ||
      !current.data.provider_city_id
    ) {
      return {
        error: "invalid_input",
        fieldErrors: { city: "Confirm a handoff city before saving." },
        status: "error",
      };
    }
    cityAnchor = {
      countryCode: current.data.country_code,
      label: current.data.city_label,
      latitude: current.data.latitude,
      longitude: current.data.longitude,
      providerCityId: current.data.provider_city_id,
    };
  }

  let outcome: Awaited<
    ReturnType<
      ReturnType<typeof context.supabase.schema>["rpc"]
    >
  >;
  try {
    outcome = await context.supabase
      .schema("api")
      .rpc("replace_camera_handoff_policy", {
        p_allowed_weekdays: weekdays,
        p_approved_times: approvedTimes,
        p_camera_id: base.data.cameraId,
        p_city_label: cityAnchor.label,
        p_country_code: cityAnchor.countryCode,
        p_enabled: enabled,
        p_expected_version: base.data.expectedVersion,
        p_latitude: cityAnchor.latitude,
        p_longitude: cityAnchor.longitude,
        p_provider_city_id: cityAnchor.providerCityId,
      });
  } catch {
    return { error: "save_failed", status: "error" };
  }
  const { data, error } = outcome;

  if (error) {
    return {
      error:
        error.code === "40001"
          ? "stale"
          : error.code === "42501"
            ? "unauthorized"
            : "save_failed",
      status: "error",
    };
  }
  const version = Number(data);
  if (!Number.isSafeInteger(version) || version < 1) {
    return { error: "save_failed", status: "error" };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/cameras/${base.data.cameraId}/handoff`);
  revalidatePath("/");

  return { cityLabel: cityAnchor.label, status: "success", version };
}
