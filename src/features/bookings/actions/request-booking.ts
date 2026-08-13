"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { loginPath } from "@/lib/auth/routes";

import { parseManilaBookingPeriod } from "../manila-time";
import { stringFormValue, type ActionStatus } from "./state";

export type RequestBookingActionState = {
  error?:
    | "invalid_input"
    | "profile_required"
    | "request_failed"
    | "suspended";
  fieldErrors?: {
    camera?: string;
    expectedLocation?: string;
    intendedUse?: string;
    pickup?: string;
    return?: string;
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
    return: stringFormValue(formData, "return"),
  };
  const fields = bookingFieldsSchema.safeParse(values);
  const period = parseManilaBookingPeriod(values.pickup, values.return);
  const fieldErrors: RequestBookingActionState["fieldErrors"] = period.ok
    ? {}
    : { ...period.fieldErrors };
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

  if (!fields.success || !period.ok) {
    return {
      error: "invalid_input",
      fieldErrors,
      status: "error",
      values: preservedValues,
    };
  }

  const context = await getAuthenticatedUser();
  if (!context) {
    const query = new URLSearchParams({
      camera: fields.data.camera,
      pickup: values.pickup,
      return: values.return,
    });
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

  const { data, error } = await context.supabase
    .schema("api")
    .rpc("request_booking", {
      p_camera_id: fields.data.camera,
      p_expected_location: fields.data.expectedLocation,
      p_intended_use: fields.data.intendedUse,
      p_pickup_at: period.pickupAt,
      p_return_at: period.returnAt,
    });

  if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
    return {
      error: "request_failed",
      status: "error",
      values: preservedValues,
    };
  }

  revalidatePath("/account");
  redirect(`/account/bookings/${data}?requested=1`);
}
