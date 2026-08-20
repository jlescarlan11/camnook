"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { loginPath } from "@/lib/auth/routes";

import { isCalendarDate, isHandoffTime } from "../calendar";
import { isHandoffSchedulingEnabled } from "../handoff-rollout";
import { parseManilaBookingPeriod } from "../manila-time";
import { stringFormValue, type ActionStatus } from "./state";

export type RequestBookingActionState = {
  error?:
    | "invalid_input"
    | "profile_required"
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
  };
  const usesSchedule = [
    values.pickupDate,
    values.returnDate,
    values.handoffTime,
    values.policyVersion,
  ].some((value) => value !== "");
  const fields = bookingFieldsSchema.safeParse(values);
  const period = usesSchedule
    ? null
    : parseManilaBookingPeriod(values.pickup, values.return);
  const fieldErrors: RequestBookingActionState["fieldErrors"] =
    period && !period.ok ? { ...period.fieldErrors } : {};
  const preservedValues = {
    expectedLocation: values.expectedLocation,
    intendedUse: values.intendedUse,
  };
  const schedulingEnabled = isHandoffSchedulingEnabled();

  if (!usesSchedule && schedulingEnabled) {
    return {
      error: "schedule_changed",
      status: "error",
      values: preservedValues,
    };
  }

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

  let policyVersion: number | null = null;
  if (usesSchedule) {
    if (!schedulingEnabled) {
      return {
        error: "schedule_changed",
        status: "error",
        values: preservedValues,
      };
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
    if (
      !/^\d+$/.test(values.policyVersion) ||
      !Number.isSafeInteger(parsedVersion) ||
      parsedVersion < 1
    ) {
      fieldErrors.policyVersion = "The handoff schedule must be refreshed.";
    } else {
      policyVersion = parsedVersion;
    }
  }

  if (
    !fields.success ||
    (usesSchedule ? Object.keys(fieldErrors).length > 0 : !period?.ok)
  ) {
    return {
      error: "invalid_input",
      fieldErrors,
      status: "error",
      values: preservedValues,
    };
  }
  const legacyPeriod = period?.ok ? period : null;

  const context = await getAuthenticatedUser();
  if (!context) {
    const query = new URLSearchParams(
      usesSchedule
        ? {
            camera: fields.data.camera,
            handoffTime: values.handoffTime,
            pickupDate: values.pickupDate,
            policyVersion: values.policyVersion,
            returnDate: values.returnDate,
          }
        : {
            camera: fields.data.camera,
            pickup: values.pickup,
            return: values.return,
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

  const api = context.supabase.schema("api");
  const { data, error } = usesSchedule
    ? await api.rpc("request_booking_schedule", {
        p_camera_id: fields.data.camera,
        p_expected_location: fields.data.expectedLocation,
        p_handoff_time: values.handoffTime,
        p_intended_use: fields.data.intendedUse,
        p_pickup_date: values.pickupDate,
        p_policy_version: policyVersion!,
        p_return_date: values.returnDate,
      })
    : await api.rpc("request_booking", {
        p_camera_id: fields.data.camera,
        p_expected_location: fields.data.expectedLocation,
        p_intended_use: fields.data.intendedUse,
        p_pickup_at: legacyPeriod!.pickupAt,
        p_return_at: legacyPeriod!.returnAt,
      });

  if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
    return {
      error:
        error?.code === "40001"
          ? "schedule_changed"
          : error?.code === "23P01"
            ? "unavailable"
            : "request_failed",
      status: "error",
      values: preservedValues,
    };
  }

  revalidatePath("/account");
  redirect(`/account/bookings/${data}?requested=1`);
}
