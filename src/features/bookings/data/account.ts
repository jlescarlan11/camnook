import "server-only";

import { z } from "zod";

import type { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.generated";

import {
  loadContractHistory,
  projectContractHistorySnapshot,
} from "../../contracts/data";
import {
  projectMeetupPlan,
  SAFE_MEETUP_PLAN_COLUMNS,
  safeMeetupPlanRowSchema,
  type SafeMeetupPlan,
} from "../../meetups/plan";
import { paymentStateSchema } from "../../payments/types";
import { myPickupStateSchema } from "../../pickup/types";
import {
  myResolutionStateSchema,
  resolutionBookingStateSchema,
} from "../../resolution/types";

export const SAFE_BOOKING_COLUMNS =
  "id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency,current_contract_version_id,meetup_snapshot_required";

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

const bookingDetailContextSchema = z.object({
  booking: z.object({
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
  }).strict(),
  camera: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
  }).strict().nullable(),
  meetup: safeMeetupPlanRowSchema.nullable(),
  payment: paymentStateSchema,
  pickup: myPickupStateSchema,
  resolution: myResolutionStateSchema,
  versions: z.unknown(),
}).strict();

export type BookingDTO = ReturnType<typeof projectBooking>;

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

export async function loadAccountData(context: UserContext) {
  const [profileResult, bookingsResult] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("legal_name,phone,account_status")
      .eq("user_id", context.user.id)
      .maybeSingle(),
    context.supabase
      .from("bookings")
      .select(SAFE_BOOKING_COLUMNS)
      .eq("renter_id", context.user.id)
      .order("requested_at", { ascending: false }),
  ]);

  if (profileResult.error || bookingsResult.error) {
    return { status: "error" } as const;
  }

  const rows = (bookingsResult.data ?? []) as SafeBookingRow[];
  const cameraIds = [...new Set(rows.map((booking) => booking.camera_id))];
  let cameras: { id: string | null; name: string | null; slug: string | null }[] = [];

  if (cameraIds.length > 0) {
    const cameraResult = await context.supabase
      .from("public_cameras")
      .select("id,name,slug")
      .in("id", cameraIds);
    if (!cameraResult.error) cameras = cameraResult.data ?? [];
  }

  const cameraById = new Map(
    cameras.flatMap((camera) =>
      camera.id && camera.name && camera.slug
        ? [[camera.id, { name: camera.name, slug: camera.slug }] as const]
        : [],
    ),
  );
  const meetupResult = rows.length
    ? await context.supabase
        .from("booking_meetup_plans")
        .select(SAFE_MEETUP_PLAN_COLUMNS)
        .in("booking_id", rows.map((booking) => booking.id))
    : { data: [], error: null };
  const plans = z.array(safeMeetupPlanRowSchema).safeParse(meetupResult.data);
  if (meetupResult.error || !plans.success) return { status: "error" } as const;
  const meetupByBooking = new Map(
    plans.data.map((plan) => [plan.booking_id, projectMeetupPlan(plan)]),
  );
  if (
    rows.some(
      (booking) =>
        booking.meetup_snapshot_required && !meetupByBooking.has(booking.id),
    )
  ) {
    return { status: "error" } as const;
  }

  return {
    bookings: rows.map((booking) =>
      projectBooking(
        booking,
        cameraById.get(booking.camera_id) ?? null,
        meetupByBooking.get(booking.id) ?? null,
      ),
    ),
    profile: profileResult.data
      ? {
          accountStatus: profileResult.data.account_status,
          legalName: profileResult.data.legal_name,
          phone: profileResult.data.phone,
        }
      : null,
    status: "success" as const,
  };
}

export async function loadBookingDetail(
  context: UserContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const { data, error } = await context.supabase
    .from("bookings")
    .select(SAFE_BOOKING_COLUMNS)
    .eq("id", bookingId)
    .eq("renter_id", context.user.id)
    .maybeSingle();

  if (error) return { status: "error" } as const;
  if (!data) return { status: "missing" } as const;

  const row = data as SafeBookingRow;
  const [cameraResult, meetupResult] = await Promise.all([
    context.supabase
      .from("public_cameras")
      .select("name,slug")
      .eq("id", row.camera_id)
      .maybeSingle(),
    context.supabase
      .from("booking_meetup_plans")
      .select(SAFE_MEETUP_PLAN_COLUMNS)
      .eq("booking_id", row.id)
      .maybeSingle(),
  ]);
  const camera =
    !cameraResult.error && cameraResult.data?.name && cameraResult.data.slug
      ? { name: cameraResult.data.name, slug: cameraResult.data.slug }
      : null;

  const parsedMeetup = meetupResult.data
    ? safeMeetupPlanRowSchema.safeParse(meetupResult.data)
    : null;
  if (meetupResult.error || (parsedMeetup && !parsedMeetup.success)) {
    return { status: "error" } as const;
  }
  if (row.meetup_snapshot_required && !parsedMeetup?.success) {
    return { status: "inconsistent" } as const;
  }
  const booking = projectBooking(
    row,
    camera,
    parsedMeetup?.success ? projectMeetupPlan(parsedMeetup.data) : null,
  );
  if ("approval" in booking) {
    if (!row.current_contract_version_id) {
      return { status: "inconsistent" } as const;
    }
    const agreement = await loadContractHistory(
      context,
      row.id,
      row.current_contract_version_id,
    );
    if (agreement.status === "error") return { status: "error" } as const;
    if (agreement.status === "inconsistent") {
      return { status: "inconsistent" } as const;
    }
    return {
      agreement: agreement.agreement,
      booking,
      status: "success",
    } as const;
  }

  return { agreement: null, booking, status: "success" } as const;
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
