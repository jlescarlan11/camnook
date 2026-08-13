import "server-only";

import { z } from "zod";

import type { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.generated";

export const SAFE_BOOKING_COLUMNS =
  "id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency";

type UserContext = Awaited<ReturnType<typeof requireUser>>;

export type SafeBookingRow = {
  approval_deadline_at: string | null;
  approved_at: string | null;
  billable_days_snapshot: number | null;
  camera_id: string;
  currency: string;
  daily_rate_snapshot: number | null;
  expected_location: string;
  id: string;
  intended_use: string;
  pickup_at: string;
  rental_amount: number | null;
  requested_at: string;
  return_at: string;
  security_deposit_amount: number | null;
  state: Database["public"]["Enums"]["booking_state"];
  total_due: number | null;
};

type PublicCameraIdentity = { name: string; slug: string };

export type BookingDTO = ReturnType<typeof projectBooking>;

export function projectBooking(
  row: SafeBookingRow,
  camera: PublicCameraIdentity | null,
) {
  const booking = {
    camera: camera ?? {
      name: "Camera no longer publicly listed",
      slug: null,
    },
    expectedLocation: row.expected_location,
    id: row.id,
    intendedUse: row.intended_use,
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

  return {
    bookings: rows.map((booking) =>
      projectBooking(booking, cameraById.get(booking.camera_id) ?? null),
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
  const cameraResult = await context.supabase
    .from("public_cameras")
    .select("name,slug")
    .eq("id", row.camera_id)
    .maybeSingle();
  const camera =
    !cameraResult.error && cameraResult.data?.name && cameraResult.data.slug
      ? { name: cameraResult.data.name, slug: cameraResult.data.slug }
      : null;

  return { booking: projectBooking(row, camera), status: "success" } as const;
}

export function bookingPresentation(
  result: { status: "missing" } | { status: "error" },
) {
  return result.status === "missing"
    ? {
        kind: "not_found" as const,
        message: "This booking could not be found.",
      }
    : {
        kind: "error" as const,
        message:
          "We couldn’t load this booking. Please try again from your account.",
      };
}
