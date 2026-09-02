import "server-only";

import { z } from "zod";

import type { requireUser } from "@/lib/auth/require-user";

import { isCalendarDate, isHandoffTime } from "../calendar";

type UserContext = Awaited<ReturnType<typeof requireUser>>;

export type BookingRequestPageValues = {
  camera: string;
  handoffTime: string;
  pickupDate: string;
  policyVersion: string;
  returnDate: string;
};

const contextSchema = z.object({
  camera: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
  }).strict(),
  profile: z.object({
    account_status: z.enum(["active", "suspended"]),
    legal_name: z.string().min(1),
    phone: z.string().min(1),
  }).strict().nullable(),
  quote: z.object({
    billable_days: z.number().int().positive(),
    camera_id: z.uuid(),
    currency: z.literal("PHP"),
    daily_rate: z.number().nonnegative(),
    pickup_at: z.string().min(1),
    rental_amount: z.number().nonnegative(),
    return_at: z.string().min(1),
    security_deposit: z.number().nonnegative(),
    total_due: z.number().nonnegative(),
  }).strict(),
}).strict();
const meetupOriginSchema = z.object({
  active: z.boolean(),
  area_code: z.string().regex(/^\d{10}$/),
  area_name: z.string().min(1).max(160),
  area_type: z.string(),
  current: z.boolean(),
  path: z.array(z.unknown()),
  precision: z.enum(["city_centroid", "barangay_centroid", "precise"]),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
}).strict().nullable();

export async function loadBookingRequestPageContext(
  context: UserContext,
  values: BookingRequestPageValues,
) {
  const camera = z.uuid().safeParse(values.camera);
  const policyVersion = Number(values.policyVersion);
  if (
    !camera.success ||
    !isCalendarDate(values.pickupDate) ||
    !isCalendarDate(values.returnDate) ||
    !isHandoffTime(values.handoffTime) ||
    !/^\d+$/.test(values.policyVersion) ||
    !Number.isSafeInteger(policyVersion) ||
    policyVersion < 1
  ) {
    return { status: "error" } as const;
  }

  const [result, originResult] = await Promise.all([
    context.supabase.schema("api").rpc("get_booking_request_page_context", {
      p_camera_id: camera.data,
      p_handoff_time: values.handoffTime,
      p_pickup_date: values.pickupDate,
      p_policy_version: policyVersion,
      p_return_date: values.returnDate,
    }),
    context.supabase.schema("api").rpc("get_my_meetup_origin"),
  ]);
  const parsed = contextSchema.safeParse(result.data);
  const origin = meetupOriginSchema.safeParse(originResult.data);
  if (
    result.error ||
    originResult.error ||
    !parsed.success ||
    !origin.success ||
    parsed.data.camera.id !== camera.data ||
    parsed.data.quote.camera_id !== camera.data
  ) {
    return { status: "error" } as const;
  }

  const data = parsed.data;
  return {
    camera: data.camera,
    profile: data.profile
      ? {
          accountStatus: data.profile.account_status,
          legalName: data.profile.legal_name,
          phone: data.profile.phone,
        }
      : null,
    meetupOrigin: origin.data ? {
      areaName: origin.data.area_name,
      precision: origin.data.precision,
      valid: origin.data.active && origin.data.current,
    } : null,
    quote: {
      billableDays: data.quote.billable_days,
      cameraId: data.quote.camera_id,
      currency: data.quote.currency,
      dailyRate: data.quote.daily_rate,
      pickupAt: data.quote.pickup_at,
      rentalAmount: data.quote.rental_amount,
      returnAt: data.quote.return_at,
      securityDeposit: data.quote.security_deposit,
      totalDue: data.quote.total_due,
    },
    status: "success" as const,
  };
}
