"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { loginPath } from "@/lib/auth/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMeetupBinding } from "@/features/meetups/binding";
import { getMeetupProviderConfig } from "@/features/meetups/config";
import { readRecommendationReference } from "@/features/meetups/reference";

import { isCalendarDate, isHandoffTime } from "../calendar";
import { stringFormValue, type ActionStatus } from "./state";

export type RequestBookingActionState = {
  error?:
    | "invalid_input"
    | "meetup_expired"
    | "meetup_required"
    | "profile_required"
    | "request_limit"
    | "request_failed"
    | "schedule_changed"
    | "unavailable"
    | "suspended";
  fieldErrors?: {
    camera?: string;
    expectedLocation?: string;
    intendedUse?: string;
    handoffTime?: string;
    pickup?: string;
    pickupDate?: string;
    policyVersion?: string;
    return?: string;
    returnDate?: string;
    meetupReference?: string;
  };
  status: ActionStatus;
  values?: { expectedLocation: string; intendedUse: string };
};

const bookingFieldsSchema = z.object({
  camera: z.uuid(),
  expectedLocation: z.string().trim().min(2).max(500),
  intendedUse: z.string().trim().min(2).max(1000),
});

export async function requestBooking(
  _state: RequestBookingActionState,
  formData: FormData,
): Promise<RequestBookingActionState> {
  const values = {
    camera: stringFormValue(formData, "camera"),
    expectedLocation: stringFormValue(formData, "expectedLocation"),
    intendedUse: stringFormValue(formData, "intendedUse"),
    pickup: stringFormValue(formData, "pickup"),
    pickupDate: stringFormValue(formData, "pickupDate"),
    handoffTime: stringFormValue(formData, "handoffTime"),
    policyVersion: stringFormValue(formData, "policyVersion"),
    return: stringFormValue(formData, "return"),
    returnDate: stringFormValue(formData, "returnDate"),
    meetupConfirmed: stringFormValue(formData, "meetupConfirmed"),
    meetupReference: stringFormValue(formData, "meetupReference"),
    operationId: stringFormValue(formData, "operationId"),
  };
  const usesSchedule = [
    values.pickupDate,
    values.returnDate,
    values.handoffTime,
    values.policyVersion,
  ].some((value) => value !== "");
  const fields = bookingFieldsSchema.safeParse(values);
  const operationId = z.uuid().safeParse(values.operationId);
  const fieldErrors: RequestBookingActionState["fieldErrors"] = {};
  const preservedValues = {
    expectedLocation: values.expectedLocation,
    intendedUse: values.intendedUse,
  };
  if (!fields.success) {
    const flattened = z.flattenError(fields.error).fieldErrors;
    if (flattened.camera) fieldErrors.camera = "Choose a camera.";
    if (flattened.expectedLocation) {
      fieldErrors.expectedLocation =
        "Describe the expected location (2–500 characters).";
    }
    if (flattened.intendedUse) {
      fieldErrors.intendedUse =
        "Describe the intended use (2–1000 characters).";
    }
  }

  if (!isCalendarDate(values.pickupDate)) {
    fieldErrors.pickupDate = "Choose a valid pickup date.";
  }
  if (!isCalendarDate(values.returnDate)) {
    fieldErrors.returnDate = "Choose a valid return date.";
  }
  if (!isHandoffTime(values.handoffTime)) {
    fieldErrors.handoffTime = "Choose an approved handoff time.";
  }
  const parsedVersion = Number(values.policyVersion);
  let policyVersion: number | null = null;
  if (
    !/^\d+$/.test(values.policyVersion) ||
    !Number.isSafeInteger(parsedVersion) ||
    parsedVersion < 1
  ) {
    fieldErrors.policyVersion = "The handoff schedule must be refreshed.";
  } else {
    policyVersion = parsedVersion;
  }

  if (
    !usesSchedule || !fields.success || !operationId.success ||
    Object.keys(fieldErrors).length > 0
  ) {
    return {
      error: "invalid_input",
      fieldErrors,
      status: "error",
      values: preservedValues,
    };
  }
  if (
    (values.meetupConfirmed !== "true" || !values.meetupReference)
  ) {
    return {
      error: "meetup_required",
      fieldErrors: { meetupReference: "Confirm the current public meetup recommendation." },
      status: "error",
      values: preservedValues,
    };
  }
  const context = await getAuthenticatedUser();
  if (!context) {
    const query = new URLSearchParams(
      {
        camera: fields.data.camera,
        handoffTime: values.handoffTime,
        pickupDate: values.pickupDate,
        policyVersion: values.policyVersion,
        returnDate: values.returnDate,
      },
    );
    redirect(loginPath(`/account/bookings/new?${query.toString()}`));
  }

  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("account_status")
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      error: "request_failed",
      status: "error",
      values: preservedValues,
    };
  }
  if (!profile) {
    return {
      error: "profile_required",
      status: "error",
      values: preservedValues,
    };
  }
  if (profile.account_status !== "active") {
    return { error: "suspended", status: "error", values: preservedValues };
  }

  const config = getMeetupProviderConfig();
  if (!config) {
    return { error: "request_failed", status: "error", values: preservedValues };
  }
  const binding = buildMeetupBinding({
    cameraId: fields.data.camera,
    configVersion: config.configVersion,
    handoffTime: values.handoffTime,
    pickupDate: values.pickupDate,
    policyVersion: policyVersion!,
    renterId: context.user.id,
    returnDate: values.returnDate,
  });
  const claims = readRecommendationReference(
    values.meetupReference,
    config.referenceSecret,
    { binding },
  );
  if (!claims || claims.configVersion !== config.configVersion) {
    return { error: "meetup_expired", status: "error", values: preservedValues };
  }
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { error: "request_failed", status: "error", values: preservedValues };
  }
  const result = await admin.schema("api").rpc("request_booking_schedule_with_meetup_idempotent", {
    p_camera_id: fields.data.camera,
    p_expected_location: fields.data.expectedLocation,
    p_handoff_time: values.handoffTime,
    p_intended_use: fields.data.intendedUse,
    p_pickup_date: values.pickupDate,
    p_policy_version: policyVersion!,
    p_provider_config_version: claims.configVersion,
    p_renter_city_label: claims.renterCity.label,
    p_renter_id: context.user.id,
    p_return_date: values.returnDate,
    p_venue_address: claims.address,
    p_venue_city: claims.city,
    p_venue_latitude: claims.latitude,
    p_venue_longitude: claims.longitude,
    p_venue_name: claims.name,
    p_operation_id: operationId.data,
  });
  const { data, error } = result;

  if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
    return {
      error:
        error?.code === "P0001"
          ? "request_limit"
          : error?.code === "40001"
          ? "schedule_changed"
          : error?.code === "23P01"
            ? "unavailable"
            : error?.code === "23514"
              ? "meetup_required"
            : "request_failed",
      status: "error",
      values: preservedValues,
    };
  }

  revalidatePath("/account");
  redirect(`/account/bookings/${data}?requested=1`);
}
