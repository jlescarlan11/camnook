import "server-only";

import { z } from "zod";

import {
  isAdminAuthorizationError,
  type requireAdmin,
} from "@/lib/auth/require-admin";
import {
  projectMeetupPlan,
  safeMeetupPlanRowSchema,
} from "@/features/meetups/plan";
import { projectAdminContractContext } from "@/features/contracts/data";
import { pickupDetailSchema } from "@/features/pickup/types";
import { resolutionDetailSchema } from "@/features/resolution/types";

import { assessApprovalReadiness } from "./readiness";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export const ADMIN_QUEUE_BOOKING_COLUMNS =
  "id,renter_id,camera_id,pickup_at,return_at,requested_at";
const adminDetailSnapshotSchema = z.object({
  accessories: z.array(z.object({
    id: z.uuid(),
    name: z.string(),
    quantity: z.number().int(),
    sort_position: z.number().int(),
  })),
  availability: z.array(z.object({
    ends_at: z.string().nullable(),
    reason: z.string().nullable(),
    starts_at: z.string().nullable(),
  })),
  booking: z.object({
    approval_deadline_at: z.string().nullable(),
    approved_at: z.string().nullable(),
    billable_days_snapshot: z.number().int().nullable(),
    camera_id: z.uuid(),
    currency: z.string(),
    current_contract_version_id: z.uuid().nullable(),
    daily_rate_snapshot: z.number().nullable(),
    expected_location: z.string(),
    id: z.uuid(),
    intended_use: z.string(),
    meetup_snapshot_required: z.boolean(),
    pickup_at: z.string(),
    rental_amount: z.number().nullable(),
    renter_id: z.uuid(),
    requested_at: z.string(),
    return_at: z.string(),
    security_deposit_amount: z.number().nullable(),
    state: z.string(),
    total_due: z.number().nullable(),
  }),
  camera: z.object({
    daily_rate: z.number().nullable(),
    id: z.uuid(),
    name: z.string(),
    published_at: z.string().nullable(),
    security_deposit: z.number().nullable(),
    slug: z.string(),
    status: z.string(),
  }).nullable(),
  contract: z.object({
    id: z.uuid(),
    issued_at: z.string(),
    status: z.string(),
    template_id: z.uuid(),
    version_no: z.number().int(),
  }).nullable(),
  meetup: safeMeetupPlanRowSchema.nullable(),
  profile: z.object({
    account_status: z.string(),
    legal_name: z.string(),
    phone: z.string(),
  }).nullable(),
  quote: z.unknown().nullable(),
  rejection: z.object({
    note: z.string().nullable(),
    occurred_at: z.string(),
  }).nullable(),
  template: z.object({
    activated_at: z.string().nullable(),
    approved_at: z.string().nullable(),
    deactivated_at: z.string().nullable(),
    id: z.uuid(),
    schema_version: z.number().int(),
    terms: z.unknown(),
    version: z.string(),
  }).nullable(),
});
const adminBookingPageContextSchema = z.object({
  contract: z.unknown().nullable(),
  detail: z.unknown(),
  pickup: z.unknown().nullable(),
  resolution: z.unknown(),
}).strict();

type QueueBookingRow = {
  camera_id: string;
  id: string;
  pickup_at: string;
  renter_id: string;
  requested_at: string;
  return_at: string;
};

type DetailBookingRow = QueueBookingRow & {
  approval_deadline_at: string | null;
  approved_at: string | null;
  billable_days_snapshot: number | null;
  currency: string;
  current_contract_version_id: string | null;
  daily_rate_snapshot: number | null;
  expected_location: string;
  intended_use: string;
  meetup_snapshot_required: boolean;
  rental_amount: number | null;
  security_deposit_amount: number | null;
  state: string;
  total_due: number | null;
};

type AvailabilityRow = {
  ends_at: string | null;
  reason: string | null;
  starts_at: string | null;
};

type ContractReferenceRow = {
  id: string;
  issued_at: string;
  status: string;
  template_id: string;
  version_no: number;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

export async function loadAdminQueue(context: AdminContext) {
  const bookingsResult = await context.supabase
    .from("bookings")
    .select(ADMIN_QUEUE_BOOKING_COLUMNS)
    .eq("state", "FOR_REVIEW")
    .order("requested_at", { ascending: true });

  if (bookingsResult.error) return { status: "error" } as const;
  const rows = (bookingsResult.data ?? []) as QueueBookingRow[];
  if (rows.length === 0) {
    return { bookings: [], status: "success" } as const;
  }

  const [profilesResult, camerasResult] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("user_id,legal_name")
      .in("user_id", unique(rows.map((row) => row.renter_id))),
    context.supabase
      .from("cameras")
      .select("id,name")
      .in("id", unique(rows.map((row) => row.camera_id))),
  ]);

  if (profilesResult.error || camerasResult.error) {
    return { status: "error" } as const;
  }

  const legalNameById = new Map(
    ((profilesResult.data ?? []) as { legal_name: string; user_id: string }[]).map(
      (profile) => [profile.user_id, profile.legal_name],
    ),
  );
  const cameraNameById = new Map(
    ((camerasResult.data ?? []) as { id: string; name: string }[]).map(
      (camera) => [camera.id, camera.name],
    ),
  );

  return {
    bookings: rows.map((row) => ({
      cameraName: cameraNameById.get(row.camera_id) ?? "Camera unavailable",
      id: row.id,
      pickupAt: row.pickup_at,
      renterLegalName:
        legalNameById.get(row.renter_id) ?? "Profile unavailable",
      requestedAt: row.requested_at,
      returnAt: row.return_at,
    })),
    status: "success",
  } as const;
}

function sanitizedAvailability(rows: AvailabilityRow[]) {
  return rows.flatMap((row) =>
    row.starts_at && row.ends_at && row.reason
      ? [
          {
            endsAt: row.ends_at,
            reason: row.reason,
            startsAt: row.starts_at,
          },
        ]
      : [],
  );
}

function sanitizedQuote(data: unknown) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const quote = data[0] as Record<string, unknown>;
  if (
    typeof quote.billable_days !== "number" ||
    quote.currency !== "PHP" ||
    typeof quote.daily_rate !== "number" ||
    typeof quote.rental_amount !== "number" ||
    typeof quote.security_deposit !== "number" ||
    typeof quote.total_due !== "number"
  ) {
    return null;
  }

  return {
    billableDays: quote.billable_days,
    currency: "PHP" as const,
    dailyRate: quote.daily_rate,
    rentalAmount: quote.rental_amount,
    securityDeposit: quote.security_deposit,
    totalDue: quote.total_due,
  };
}

function projectApproval(
  booking: DetailBookingRow,
  contract: ContractReferenceRow | null,
) {
  if (
    booking.approved_at === null ||
    booking.approval_deadline_at === null ||
    booking.billable_days_snapshot === null ||
    booking.current_contract_version_id === null ||
    booking.daily_rate_snapshot === null ||
    booking.rental_amount === null ||
    booking.security_deposit_amount === null ||
    booking.total_due === null ||
    contract === null ||
    contract.id !== booking.current_contract_version_id
  ) {
    return null;
  }

  return {
    approvalDeadlineAt: booking.approval_deadline_at,
    approvedAt: booking.approved_at,
    billableDays: booking.billable_days_snapshot,
    contractReference: {
      id: contract.id,
      issuedAt: contract.issued_at,
      status: contract.status,
      templateId: contract.template_id,
      versionNo: contract.version_no,
    },
    currency: booking.currency,
    currentContractVersionId: booking.current_contract_version_id,
    dailyRate: booking.daily_rate_snapshot,
    rentalAmount: booking.rental_amount,
    securityDeposit: booking.security_deposit_amount,
    totalDue: booking.total_due,
  };
}

export async function loadAdminBookingDetail(
  context: AdminContext,
  bookingId: string,
  now = new Date(),
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const snapshotResult = await context.supabase
    .schema("api")
    .rpc("get_admin_booking_detail_snapshot", { p_booking_id: bookingId });

  if (snapshotResult.error?.code === "P0002") {
    return { status: "missing" } as const;
  }
  if (snapshotResult.error) return { status: "error" } as const;
  return projectAdminBookingDetailSnapshot(snapshotResult.data, now);
}

export function projectAdminBookingDetailSnapshot(
  value: unknown,
  now = new Date(),
) {
  const snapshot = adminDetailSnapshotSchema.safeParse(value);
  if (!snapshot.success) return { status: "error" } as const;

  const {
    accessories,
    booking,
    camera,
    contract,
    meetup,
    profile,
    template,
  } = snapshot.data;
  const availability = sanitizedAvailability(
    snapshot.data.availability,
  );
  if (booking.meetup_snapshot_required && !meetup) {
    return { status: "inconsistent" } as const;
  }

  const quote = sanitizedQuote(
    snapshot.data.quote === null ? null : [snapshot.data.quote],
  );

  let rejection: { reason: string; rejectedAt: string } | null = null;
  if (booking.state === "REJECTED") {
    const row = snapshot.data.rejection;
    if (row?.note) {
      rejection = { reason: row.note, rejectedAt: row.occurred_at };
    }
  }

  const approval = projectApproval(booking, contract);
  if (
    (booking.state === "CONTRACT_PENDING" || booking.state === "TO_PAY") &&
    approval === null
  ) {
    return { status: "inconsistent" } as const;
  }
  if (booking.state === "REJECTED" && rejection === null) {
    return { status: "inconsistent" } as const;
  }

  const readiness = assessApprovalReadiness({
    availability,
    booking: { pickupAt: booking.pickup_at, returnAt: booking.return_at },
    camera: camera
      ? {
          dailyRate: camera.daily_rate,
          publishedAt: camera.published_at,
          securityDeposit: camera.security_deposit,
          status: camera.status,
        }
      : null,
    now,
    profileStatus: profile?.account_status ?? null,
    quote,
    template: template
      ? {
          activatedAt: template.activated_at,
          approvedAt: template.approved_at,
          deactivatedAt: template.deactivated_at,
          terms: template.terms,
        }
      : null,
  });

  return {
    booking: {
      accessories: accessories.map((accessory) => ({
        id: accessory.id,
        name: accessory.name,
        quantity: accessory.quantity,
      })),
      approval,
      availability,
      camera: camera
        ? {
            dailyRate: camera.daily_rate,
            id: camera.id,
            name: camera.name,
            publishedAt: camera.published_at,
            securityDeposit: camera.security_deposit,
            slug: camera.slug,
            status: camera.status,
          }
        : null,
      expectedLocation: booking.expected_location,
      id: booking.id,
      intendedUse: booking.intended_use,
      meetup: meetup ? projectMeetupPlan(meetup) : null,
      pickupAt: booking.pickup_at,
      profile: profile
        ? {
            accountStatus: profile.account_status,
            legalName: profile.legal_name,
            phone: profile.phone,
          }
        : null,
      quote,
      readiness,
      rejection,
      requestedAt: booking.requested_at,
      returnAt: booking.return_at,
      state: booking.state,
    },
    status: "success",
  } as const;
}

export async function loadAdminBookingPageContext(
  context: AdminContext,
  bookingId: string,
  now = new Date(),
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return {
      contractData: null,
      pickupData: null,
      resolutionData: null,
      result: { status: "missing" as const },
    };
  }

  const response = await context.supabase
    .schema("api")
    .rpc("get_admin_booking_page_context", { p_booking_id: bookingId });
  if (isAdminAuthorizationError(response.error)) {
    return {
      contractData: null,
      pickupData: null,
      resolutionData: null,
      result: { status: "forbidden" as const },
    };
  }
  if (response.error?.code === "P0002") {
    return {
      contractData: null,
      pickupData: null,
      resolutionData: null,
      result: { status: "missing" as const },
    };
  }
  const page = adminBookingPageContextSchema.safeParse(response.data);
  if (response.error || !page.success) {
    return {
      contractData: null,
      pickupData: null,
      resolutionData: null,
      result: { status: "error" as const },
    };
  }

  const result = projectAdminBookingDetailSnapshot(page.data.detail, now);
  if (result.status !== "success") {
    return {
      contractData: null,
      pickupData: null,
      resolutionData: null,
      result,
    };
  }

  const resolution = resolutionDetailSchema.safeParse(page.data.resolution);
  const pickup = page.data.pickup === null
    ? null
    : pickupDetailSchema.safeParse(page.data.pickup);
  return {
    contractData: result.booking.approval && page.data.contract !== null
      ? projectAdminContractContext(
          page.data.contract,
          result.booking.approval.currentContractVersionId,
        )
      : null,
    pickupData: pickup === null
      ? null
      : pickup.success
        ? { pickup: pickup.data, status: "success" as const }
        : { status: "error" as const },
    resolutionData: resolution.success
      ? { resolution: resolution.data, status: "success" as const }
      : { status: "error" as const },
    result,
  };
}
