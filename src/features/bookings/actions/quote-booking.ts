"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  normalizeScheduleQuoteInputKey,
} from "../manila-time";
import { isCalendarDate, isHandoffTime } from "../calendar";
import { stringFormValue, type ActionStatus } from "./state";

export type BookingQuote = {
  billableDays: number;
  cameraId: string;
  currency: "PHP";
  dailyRate: number;
  pickupAt: string;
  rentalAmount: number;
  returnAt: string;
  securityDeposit: number;
  totalDue: number;
};

export type QuoteActionState = {
  error?:
    | "invalid_input"
    | "not_quotable"
    | "retryable"
    | "schedule_changed"
    | "unavailable";
  fieldErrors?: {
    camera?: string;
    handoffTime?: string;
    pickup?: string;
    pickupDate?: string;
    policyVersion?: string;
    return?: string;
    returnDate?: string;
  };
  inputKey?: string;
  quote?: BookingQuote;
  status: ActionStatus;
  submissionGeneration?: number;
  values?: Record<string, string>;
};

const cameraSchema = z.uuid();

export async function quoteBooking(
  _state: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const values = {
    camera: stringFormValue(formData, "camera"),
    pickup: stringFormValue(formData, "pickup"),
    return: stringFormValue(formData, "return"),
  };
  const scheduleValues = {
    camera: values.camera,
    handoffTime: stringFormValue(formData, "handoffTime"),
    pickupDate: stringFormValue(formData, "pickupDate"),
    policyVersion: stringFormValue(formData, "policyVersion"),
    returnDate: stringFormValue(formData, "returnDate"),
  };
  const usesSchedule = [
    scheduleValues.handoffTime,
    scheduleValues.pickupDate,
    scheduleValues.policyVersion,
    scheduleValues.returnDate,
  ].some((value) => value !== "");
  const generationValue = stringFormValue(formData, "generation");
  const parsedGeneration = Number(generationValue);
  const submissionGeneration =
    /^\d+$/.test(generationValue) && Number.isSafeInteger(parsedGeneration)
      ? parsedGeneration
      : 0;
  const camera = cameraSchema.safeParse(values.camera);
  const fieldErrors: QuoteActionState["fieldErrors"] = {};

  if (!camera.success) {
    fieldErrors.camera = "Choose a camera.";
  }

  if (!isCalendarDate(scheduleValues.pickupDate)) {
    fieldErrors.pickupDate = "Choose a valid pickup date.";
  }
  if (!isCalendarDate(scheduleValues.returnDate)) {
    fieldErrors.returnDate = "Choose a valid return date.";
  }
  if (!isHandoffTime(scheduleValues.handoffTime)) {
    fieldErrors.handoffTime = "Choose an approved handoff time.";
  }
  const parsedVersion = Number(scheduleValues.policyVersion);
  let policyVersion: number | null = null;
  if (
    !/^\d+$/.test(scheduleValues.policyVersion) ||
    !Number.isSafeInteger(parsedVersion) ||
    parsedVersion < 1
  ) {
    fieldErrors.policyVersion = "The handoff schedule must be refreshed.";
  } else {
    policyVersion = parsedVersion;
  }

  if (!usesSchedule || !camera.success || Object.keys(fieldErrors).length > 0) {
    return {
      error: "invalid_input",
      fieldErrors,
      status: "error",
      submissionGeneration,
      values: scheduleValues,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("quote_booking_schedule", {
    p_camera_id: camera.data,
    p_handoff_time: scheduleValues.handoffTime,
    p_pickup_date: scheduleValues.pickupDate,
    p_policy_version: policyVersion!,
    p_return_date: scheduleValues.returnDate,
  });
  const quote = data?.[0];

  if (error || !quote || quote.currency !== "PHP") {
    return {
      error:
        error?.code === "40001"
          ? "schedule_changed"
          : error?.code === "23P01"
            ? "unavailable"
            : error?.code === "22023"
              ? "not_quotable"
              : "retryable",
      status: "error",
      submissionGeneration,
      values: scheduleValues,
    };
  }

  return {
    inputKey: normalizeScheduleQuoteInputKey(scheduleValues),
    quote: {
      billableDays: quote.billable_days,
      cameraId: quote.camera_id,
      currency: quote.currency,
      dailyRate: quote.daily_rate,
      pickupAt: quote.pickup_at,
      rentalAmount: quote.rental_amount,
      returnAt: quote.return_at,
      securityDeposit: quote.security_deposit,
      totalDue: quote.total_due,
    },
    status: "success",
    submissionGeneration,
    values: scheduleValues,
  };
}
