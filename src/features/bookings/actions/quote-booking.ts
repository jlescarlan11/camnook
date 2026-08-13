"use server";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  normalizeQuoteInputKey,
  parseManilaBookingPeriod,
} from "../manila-time";
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
  error?: "invalid_input" | "not_quotable" | "retryable";
  fieldErrors?: { camera?: string; pickup?: string; return?: string };
  inputKey?: string;
  quote?: BookingQuote;
  status: ActionStatus;
  submissionGeneration?: number;
  values?: { camera: string; pickup: string; return: string };
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
  const generationValue = stringFormValue(formData, "generation");
  const parsedGeneration = Number(generationValue);
  const submissionGeneration =
    /^\d+$/.test(generationValue) && Number.isSafeInteger(parsedGeneration)
      ? parsedGeneration
      : 0;
  const camera = cameraSchema.safeParse(values.camera);
  const period = parseManilaBookingPeriod(values.pickup, values.return);
  const fieldErrors: QuoteActionState["fieldErrors"] = period.ok
    ? {}
    : { ...period.fieldErrors };

  if (!camera.success) {
    fieldErrors.camera = "Choose a camera.";
  }

  if (!camera.success || !period.ok) {
    return {
      error: "invalid_input",
      fieldErrors,
      status: "error",
      submissionGeneration,
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("quote_booking", {
    p_camera_id: camera.data,
    p_pickup_at: period.pickupAt,
    p_return_at: period.returnAt,
  });
  const quote = data?.[0];

  if (error || !quote || quote.currency !== "PHP") {
    return {
      error: error?.code === "22023" ? "not_quotable" : "retryable",
      status: "error",
      submissionGeneration,
      values,
    };
  }

  return {
    inputKey: normalizeQuoteInputKey(values),
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
    values,
  };
}
