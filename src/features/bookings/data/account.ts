import "server-only";

import { z } from "zod";

import type { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.generated";

import { projectContractHistorySnapshot } from "../../contracts/data";
import {
  projectMeetupPlan,
  safeMeetupPlanRowSchema,
  type SafeMeetupPlan,
} from "../../meetups/plan";
import { paymentStateSchema } from "../../payments/types";
import { myPickupStateSchema } from "../../pickup/types";
import {
  myResolutionStateSchema,
  resolutionBookingStateSchema,
} from "../../resolution/types";

type UserContext = Awaited<ReturnType<typeof requireUser>>;

export type SafeBookingRow = {
  approval_deadline_at: string | null;
  approved_at: string | null;
  billable_days_snapshot: number | null;
  camera_id: string;
  currency: string;
  current_contract_version_id: string | null;
  daily_rate_snapshot: number | null;
  expected_location: string;
  id: string;
  intended_use: string;
  meetup_snapshot_required: boolean;
  pickup_at: string;
  rental_amount: number | null;
  requested_at: string;
  return_at: string;
  security_deposit_amount: number | null;
  state: Database["public"]["Enums"]["booking_state"];
  total_due: number | null;
};

type PublicCameraIdentity = { name: string; slug: string };

const safeBookingRowSchema = z.object({
  approval_deadline_at: z.string().nullable(),
  approved_at: z.string().nullable(),
  billable_days_snapshot: z.number().int().positive().nullable(),
  camera_id: z.uuid(),
  currency: z.string().min(1),
  current_contract_version_id: z.uuid().nullable(),
  daily_rate_snapshot: z.number().nonnegative().nullable(),
  expected_location: z.string().min(1),
  id: z.uuid(),
  intended_use: z.string().min(1),
  meetup_snapshot_required: z.boolean(),
  pickup_at: z.string().min(1),
  rental_amount: z.number().nonnegative().nullable(),
  requested_at: z.string().min(1),
  return_at: z.string().min(1),
  security_deposit_amount: z.number().nonnegative().nullable(),
  state: resolutionBookingStateSchema,
  total_due: z.number().nonnegative().nullable(),
}).strict();
const publicCameraIdentitySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
}).strict();
const safeProfileSchema = z.object({
  account_status: z.enum(["active", "suspended"]),
  legal_name: z.string().min(1),
  phone: z.string().min(1),
}).strict();

const bookingDetailContextSchema = z.object({
  booking: safeBookingRowSchema,
  camera: publicCameraIdentitySchema.nullable(),
  meetup: safeMeetupPlanRowSchema.nullable(),
  payment: paymentStateSchema,
  pickup: myPickupStateSchema,
  resolution: myResolutionStateSchema,
  versions: z.unknown(),
}).strict();
const accountOverviewSchema = z.object({
  bookings: z.array(z.object({
    booking: safeBookingRowSchema,
    camera: publicCameraIdentitySchema.nullable(),
    meetup: safeMeetupPlanRowSchema.nullable(),
  }).strict()),
  is_admin: z.boolean(),
  profile: safeProfileSchema.nullable(),
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

export function projectBooking(
  row: SafeBookingRow,
  camera: PublicCameraIdentity | null,
  meetup: SafeMeetupPlan | null = null,
) {
  const booking = {
    camera: camera ?? {
      name: "Camera no longer publicly listed",
      slug: null,
    },
    expectedLocation: row.expected_location,
    id: row.id,
    intendedUse: row.intended_use,
    meetup,
    pickupAt: row.pickup_at,
    requestedAt: row.requested_at,
    returnAt: row.return_at,
    state: row.state,
  };

  if (
    row.approved_at === null ||
    row.approval_deadline_at === null ||
    row.billable_days_snapshot === null ||
    row.daily_rate_snapshot === null ||
    row.rental_amount === null ||
    row.security_deposit_amount === null ||
    row.total_due === null
  ) {
    return booking;
  }

  return {
    ...booking,
    approval: {
      approvalDeadlineAt: row.approval_deadline_at,
      approvedAt: row.approved_at,
      billableDays: row.billable_days_snapshot,
      currency: row.currency,
      dailyRate: row.daily_rate_snapshot,
      rentalAmount: row.rental_amount,
      securityDeposit: row.security_deposit_amount,
      totalDue: row.total_due,
    },
  };
}

export async function loadAccountOverview(context: UserContext) {
  const [result, originResult] = await Promise.all([
    context.supabase.schema("api").rpc("get_my_account_overview"),
    context.supabase.schema("api").rpc("get_my_meetup_origin"),
  ]);
  const parsed = accountOverviewSchema.safeParse(result.data);
  const origin = meetupOriginSchema.safeParse(originResult.data);
  if (result.error || !parsed.success || originResult.error || !origin.success) return { status: "error" } as const;

  if (parsed.data.bookings.some(
    ({ booking, meetup }) => booking.meetup_snapshot_required && !meetup,
  )) {
    return { status: "error" } as const;
  }

  return {
    bookings: parsed.data.bookings.map(({ booking, camera, meetup }) =>
      projectBooking(
        booking as SafeBookingRow,
        camera,
        meetup ? projectMeetupPlan(meetup) : null,
      ),
    ),
    profile: parsed.data.profile
      ? {
          accountStatus: parsed.data.profile.account_status,
          legalName: parsed.data.profile.legal_name,
          phone: parsed.data.profile.phone,
        }
      : null,
    isAdmin: parsed.data.is_admin,
    meetupOrigin: origin.data ? {
      areaName: origin.data.area_name,
      precision: origin.data.precision,
      valid: origin.data.active && origin.data.current,
    } : null,
    status: "success" as const,
  };
}

export async function loadBookingDetailContext(
  context: UserContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_my_booking_detail_context", { p_booking_id: bookingId });
  const parsed = bookingDetailContextSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;

  const data = parsed.data;
  if (data.booking.meetup_snapshot_required && !data.meetup) {
    return { status: "inconsistent" } as const;
  }
  const booking = projectBooking(
    data.booking as SafeBookingRow,
    data.camera,
    data.meetup ? projectMeetupPlan(data.meetup) : null,
  );
  let agreement = null;
  if ("approval" in booking) {
    if (!data.booking.current_contract_version_id) {
      return { status: "inconsistent" } as const;
    }
    const contract = projectContractHistorySnapshot(
      data.versions,
      data.booking.current_contract_version_id,
    );
    if (contract.status !== "success") return contract;
    agreement = contract.agreement;
  }

  return {
    agreement,
    booking,
    payment: data.payment,
    pickup: data.pickup,
    resolution: data.resolution,
    status: "success",
  } as const;
}

export function bookingPresentation(result: {
  status: "missing" | "error" | "inconsistent";
}) {
  return result.status === "missing"
    ? {
        kind: "not_found" as const,
        message: "This booking could not be found.",
      }
    : result.status === "inconsistent"
      ? {
          kind: "error" as const,
          message:
            "This booking’s persisted contract record is incomplete. Signing is disabled while support investigates.",
        }
      : {
        kind: "error" as const,
        message:
          "We couldn’t load this booking. Please try again from your account.",
      };
}
