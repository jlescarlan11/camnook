"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";

export type SaveHandoffPolicyState = {
  error?: "invalid_input" | "save_failed" | "stale" | "unauthorized";
  fieldErrors?: Partial<
    Record<
      | "approvedTimes"
      | "camera"
      | "cityLabel"
      | "coordinates"
      | "providerCityId"
      | "weekdays",
      string
    >
  >;
  status: "error" | "idle" | "success";
  version?: number;
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const baseSchema = z.object({
  cameraId: z.uuid(),
  cityLabel: z.string().trim().min(2).max(120),
  expectedVersion: z.coerce.number().int().nonnegative(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  providerCityId: z.string().trim().min(2).max(240),
});

function uniqueValues<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export async function saveCameraHandoffPolicy(
  _state: SaveHandoffPolicyState,
  formData: FormData,
): Promise<SaveHandoffPolicyState> {
  const base = baseSchema.safeParse({
    cameraId: formData.get("cameraId"),
    cityLabel: formData.get("cityLabel"),
    expectedVersion: formData.get("expectedVersion"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    providerCityId: formData.get("providerCityId"),
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
    if (flattened.cityLabel) {
      fieldErrors.cityLabel = "Enter a city or municipality (2–120 characters).";
    }
    if (flattened.providerCityId) {
      fieldErrors.providerCityId = "Enter the provider’s city identifier.";
    }
    if (flattened.latitude || flattened.longitude) {
      fieldErrors.coordinates = "Enter valid coarse latitude and longitude values.";
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

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch {
    return { error: "unauthorized", status: "error" };
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
        p_city_label: base.data.cityLabel,
        p_country_code: "PH",
        p_enabled: enabled,
        p_expected_version: base.data.expectedVersion,
        p_latitude: base.data.latitude,
        p_longitude: base.data.longitude,
        p_provider_city_id: base.data.providerCityId,
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

  return { status: "success", version };
}
