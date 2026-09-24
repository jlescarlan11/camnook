"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { loginPath } from "@/lib/auth/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { isCalendarDate, isHandoffTime } from "../calendar";
import { stringFormValue, type ActionStatus } from "./state";
import { philippineMobileSchema } from "@/lib/phone/philippine-mobile";

export type RequestBookingActionState = {
  bookingId?: string;
  retryUnchanged?: boolean;
  error?:
    | "meetup_changed"
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
    meetupPlace?: string;
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
    meetupPlaceId: string;
    meetupPlaceVersion: string;
  };
};

const bookingFieldsSchema = z.object({
  camera: z.uuid(),
  expectedLocation: z.string().trim().min(2).max(500),
  intendedUse: z.string().trim().min(2).max(1000),
  legalName: z.string().trim().min(2).max(160),
  phone: philippineMobileSchema,
  meetupPlaceId: z.uuid(),
  meetupPlaceVersion: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().positive().safe()),
});

function reportBookingRequestRpcFailure(
  error: { code?: string } | null,
  data: unknown,
) {
  // Provider messages can contain request values. Keep diagnostics bounded to
  // known SQLSTATE categories and never copy raw error or response content.
  const safeCodes = ["42501", "P0001", "40001", "23P01", "55000", "23514", "22023"];
  console.error("[booking] request RPC failed", {
    code: error?.code && safeCodes.includes(error.code) ? error.code : "unknown",
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
    meetupPlaceId: stringFormValue(formData, "meetupPlaceId"),
    meetupPlaceVersion: stringFormValue(formData, "meetupPlaceVersion"),
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
    meetupPlaceId: values.meetupPlaceId,
    meetupPlaceVersion: values.meetupPlaceVersion,
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
    if (flattened.phone) fieldErrors.phone = "Enter a 10-digit Philippine mobile number after +63.";
    if (flattened.meetupPlaceId || flattened.meetupPlaceVersion) {
      fieldErrors.meetupPlace = "Choose a current meetup place.";
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
  let context: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    context = await getAuthenticatedUser();
  } catch {
    return { error: "request_failed", status: "error", values: preservedValues };
  }
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
    redirect(loginPath(`/checkout?${query.toString()}`));
  }

  let profileResult;
  try {
    profileResult = await context.supabase.schema("api").rpc("ensure_profile", {
      p_legal_name: fields.data.legalName,
      p_phone: fields.data.phone,
    });
  } catch {
    return { error: "request_failed", status: "error", values: preservedValues };
  }
  if (profileResult.error || profileResult.data?.account_status !== "active") {
    return {
      error: profileResult.data?.account_status === "suspended" ? "suspended" : "profile_required",
      status: "error",
      values: preservedValues,
    };
  }
  let result;
  try {
    const admin = createSupabaseAdminClient();
    result = await admin.schema("api").rpc("request_booking_with_place_idempotent", {
      p_camera_id: fields.data.camera,
      p_expected_location: fields.data.expectedLocation,
      p_handoff_time: values.handoffTime,
      p_intended_use: fields.data.intendedUse,
      p_pickup_date: values.pickupDate,
      p_policy_version: policyVersion!,
      p_place_id: fields.data.meetupPlaceId,
      p_place_version: fields.data.meetupPlaceVersion,
      p_renter_id: context.user.id,
      p_return_date: values.returnDate,
      p_operation_id: operationId.data,
    });
  } catch {
    // The transaction may have committed before its response was lost. Keep
    // the form alive with the same operation identity and refresh persisted data.
    revalidatePath("/account");
    return { error: "request_failed", retryUnchanged: true, status: "error", values: preservedValues };
  }
  const { data, error } = result;
  revalidatePath("/account");

  if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
    reportBookingRequestRpcFailure(error, data);
    return {
      error:
        error?.message === "meetup_changed" ? "meetup_changed" : error?.code === "42501" && error.message === "booking_profile_required"
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
      // Permission checks run before the operation receipt lookup, so they
      // cannot settle an earlier attempt whose response was lost.
      retryUnchanged: error?.code === "42501" ? undefined : !error || !["P0001", "40001", "23P01", "55000", "23514", "22023"].includes(error.code ?? ""),
      status: "error",
      values: preservedValues,
    };
  }

  return { status: "success", bookingId: data };
}
