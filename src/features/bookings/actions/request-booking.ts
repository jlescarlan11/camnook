"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { loginPath } from "@/lib/auth/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isCalendarDate, isHandoffTime } from "../calendar";
import { stringFormValue, type ActionStatus } from "./state";

export type RequestBookingActionState = {
  error?:
    | "invalid_input"
    | "kyc_required"
    | "profile_required"
    | "request_limit"
    | "request_failed"
    | "schedule_changed"
    | "unavailable"
    | "suspended";
  fieldErrors?: {
    camera?: string;
    expectedLocation?: string;
    legalName?: string;
    phone?: string;
    preferredMeetupArea?: string;
    intendedUse?: string;
    handoffTime?: string;
    pickup?: string;
    pickupDate?: string;
    policyVersion?: string;
    return?: string;
    returnDate?: string;
  };
  status: ActionStatus;
  values?: {
    expectedLocation: string;
    intendedUse: string;
    legalName: string;
    phone: string;
    preferredMeetupArea: string;
  };
};

const bookingFieldsSchema = z.object({
  camera: z.uuid(),
  expectedLocation: z.string().trim().min(2).max(500),
  intendedUse: z.string().trim().min(2).max(1000),
  legalName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32),
  preferredMeetupArea: z.string().trim().min(2).max(160),
});

function reportBookingRequestRpcFailure(
  error: { code?: string; message?: string } | null,
  data: unknown,
) {
  console.error("[booking] request RPC failed", {
    code: error?.code ?? null,
    message: error?.message ?? null,
    responseType: data === null ? "null" : typeof data,
  });
}

export async function requestBooking(
  _state: RequestBookingActionState,
  formData: FormData,
): Promise<RequestBookingActionState> {
  const values = {
    camera: stringFormValue(formData, "camera"),
    expectedLocation: stringFormValue(formData, "expectedLocation"),
    intendedUse: stringFormValue(formData, "intendedUse"),
    legalName: stringFormValue(formData, "legalName"),
    phone: stringFormValue(formData, "phone"),
    preferredMeetupArea: stringFormValue(formData, "preferredMeetupArea"),
    pickup: stringFormValue(formData, "pickup"),
    pickupDate: stringFormValue(formData, "pickupDate"),
    handoffTime: stringFormValue(formData, "handoffTime"),
    policyVersion: stringFormValue(formData, "policyVersion"),
    return: stringFormValue(formData, "return"),
    returnDate: stringFormValue(formData, "returnDate"),
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
    legalName: values.legalName,
    phone: values.phone,
    preferredMeetupArea: values.preferredMeetupArea,
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
    if (flattened.legalName) fieldErrors.legalName = "Enter your name.";
    if (flattened.phone) fieldErrors.phone = "Enter a valid phone number.";
    if (flattened.preferredMeetupArea) {
      fieldErrors.preferredMeetupArea = "Enter your preferred meetup area.";
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

  const profileResult = await context.supabase.schema("api").rpc("ensure_profile", {
    p_legal_name: fields.data.legalName,
    p_phone: fields.data.phone,
  });
  if (profileResult.error || profileResult.data?.account_status !== "active") {
    return {
      error: profileResult.data?.account_status === "suspended" ? "suspended" : "profile_required",
      status: "error",
      values: preservedValues,
    };
  }
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { error: "request_failed", status: "error", values: preservedValues };
  }
  const result = await admin.schema("api").rpc("request_booking_with_preference_idempotent", {
    p_camera_id: fields.data.camera,
    p_expected_location: fields.data.expectedLocation,
    p_handoff_time: values.handoffTime,
    p_intended_use: fields.data.intendedUse,
    p_pickup_date: values.pickupDate,
    p_policy_version: policyVersion!,
    p_preferred_meetup_area: fields.data.preferredMeetupArea,
    p_renter_id: context.user.id,
    p_return_date: values.returnDate,
    p_operation_id: operationId.data,
  });
  const { data, error } = result;

  if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
    reportBookingRequestRpcFailure(error, data);
    return {
      error:
        error?.code === "42501" && error.message === "booking_profile_required"
          ? "profile_required"
          : error?.code === "42501" && error.message === "booking_kyc_required"
            ? "kyc_required"
          : error?.code === "42501" && error.message === "booking_profile_suspended"
            ? "suspended"
              : error?.code === "P0001"
              ? "request_limit"
              : error?.code === "40001"
                ? "schedule_changed"
                : error?.code === "23P01" || error?.code === "55000"
                  ? "unavailable"
                  : error?.code === "23514" ||
                      error?.code === "22023"
                    ? "invalid_input"
                    : "request_failed",
      status: "error",
      values: preservedValues,
    };
  }

  revalidatePath("/account");
  redirect(`/account/bookings/${data}?requested=1`);
}
