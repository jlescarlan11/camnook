"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

const requestBookingSchema = z
  .object({
    cameraId: z.uuid(),
    expectedLocation: z.string().trim().min(2).max(500),
    intendedUse: z.string().trim().min(2).max(1000),
    pickupAt: z.iso.datetime({ offset: true }),
    returnAt: z.iso.datetime({ offset: true }),
  })
  .refine((value) => Date.parse(value.pickupAt) < Date.parse(value.returnAt), {
    error: "Return must be after pickup",
    path: ["returnAt"],
  });

export type RequestBookingInput = z.input<typeof requestBookingSchema>;

export type RequestBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: "invalid_input" | "request_failed" };

export async function requestBooking(
  input: RequestBookingInput,
): Promise<RequestBookingResult> {
  const parsed = requestBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid_input", ok: false };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.schema("api").rpc("request_booking", {
    p_camera_id: parsed.data.cameraId,
    p_expected_location: parsed.data.expectedLocation,
    p_intended_use: parsed.data.intendedUse,
    p_pickup_at: parsed.data.pickupAt,
    p_return_at: parsed.data.returnAt,
  });

  if (error || typeof data !== "string") {
    return { error: "request_failed", ok: false };
  }

  return { bookingId: data, ok: true };
}
