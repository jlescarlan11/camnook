import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";

import { assessApprovalReadiness } from "./readiness";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export const ADMIN_QUEUE_BOOKING_COLUMNS =
  "id,renter_id,camera_id,pickup_at,return_at,requested_at";
export const ADMIN_DETAIL_BOOKING_COLUMNS =
  "id,renter_id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency,current_contract_version_id";
export const ADMIN_PROFILE_COLUMNS =
  "user_id,legal_name,phone,account_status";
export const ADMIN_VERIFICATION_COLUMNS =
  "id,status,id_type,document_expiration_date,submitted_at,decided_at";
export const ADMIN_CAMERA_COLUMNS =
  "id,slug,name,status,published_at,daily_rate,security_deposit";
export const ADMIN_ACCESSORY_COLUMNS = "id,name,quantity,sort_position";
export const ADMIN_AVAILABILITY_COLUMNS = "starts_at,ends_at,reason";
export const ADMIN_TEMPLATE_COLUMNS =
  "id,version,schema_version,terms,approved_at,activated_at,deactivated_at";
export const ADMIN_CONTRACT_REFERENCE_COLUMNS =
  "id,template_id,version_no,status,issued_at";
export const ADMIN_REJECTION_COLUMNS = "note,occurred_at";

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
  rental_amount: number | null;
  security_deposit_amount: number | null;
  state: string;
  total_due: number | null;
};

type ProfileRow = {
  account_status: string;
  legal_name: string;
  phone: string;
  user_id?: string;
};

type CameraRow = {
  daily_rate: number | null;
  id: string;
  name: string;
  published_at: string | null;
  security_deposit: number | null;
  slug: string;
  status: string;
};

type VerificationRow = {
  decided_at: string | null;
  document_expiration_date: string | null;
  id_type: string;
  status: string;
  submitted_at: string;
};

type AccessoryRow = {
  id: string;
  name: string;
  quantity: number;
  sort_position: number;
};

type AvailabilityRow = {
  ends_at: string | null;
  reason: string | null;
  starts_at: string | null;
};

type TemplateRow = {
  activated_at: string | null;
  approved_at: string | null;
  deactivated_at: string | null;
  id: string;
  schema_version: number;
  terms: unknown;
  version: string;
};

type ContractReferenceRow = {
  id: string;
  issued_at: string;
  status: string;
  template_id: string;
  version_no: number;
};

type RejectionRow = { note: string | null; occurred_at: string };

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

  const bookingResult = await context.supabase
    .from("bookings")
    .select(ADMIN_DETAIL_BOOKING_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error) return { status: "error" } as const;
  if (!bookingResult.data) return { status: "missing" } as const;
  const booking = bookingResult.data as DetailBookingRow;

  const [
    profileResult,
    verificationResult,
    cameraResult,
    accessoriesResult,
    availabilityResult,
    templateResult,
  ] = await Promise.all([
    context.supabase
      .from("profiles")
      .select(ADMIN_PROFILE_COLUMNS)
      .eq("user_id", booking.renter_id)
      .maybeSingle(),
    context.supabase
      .from("verification_records")
      .select(ADMIN_VERIFICATION_COLUMNS)
      .eq("user_id", booking.renter_id)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from("cameras")
      .select(ADMIN_CAMERA_COLUMNS)
      .eq("id", booking.camera_id)
      .maybeSingle(),
    context.supabase
      .from("camera_accessories")
      .select(ADMIN_ACCESSORY_COLUMNS)
      .eq("camera_id", booking.camera_id)
      .is("archived_at", null)
      .order("sort_position")
      .order("name")
      .order("id"),
    context.supabase
      .from("public_availability")
      .select(ADMIN_AVAILABILITY_COLUMNS)
      .eq("camera_id", booking.camera_id)
      .order("starts_at"),
    context.supabase
      .from("contract_templates")
      .select(ADMIN_TEMPLATE_COLUMNS)
      .not("approved_at", "is", null)
      .not("activated_at", "is", null)
      .is("deactivated_at", null)
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    profileResult.error ||
    verificationResult.error ||
    cameraResult.error ||
    accessoriesResult.error ||
    availabilityResult.error ||
    templateResult.error
  ) {
    return { status: "error" } as const;
  }

  const profile = (profileResult.data as ProfileRow | null) ?? null;
  const verification =
    (verificationResult.data as VerificationRow | null) ?? null;
  const camera = (cameraResult.data as CameraRow | null) ?? null;
  const accessories = (accessoriesResult.data ?? []) as AccessoryRow[];
  const availability = sanitizedAvailability(
    (availabilityResult.data ?? []) as AvailabilityRow[],
  );
  const template = (templateResult.data as TemplateRow | null) ?? null;

  let quote = null;
  if (booking.state === "FOR_REVIEW") {
    const quoteResult = await context.supabase.schema("api").rpc("quote_booking", {
      p_camera_id: booking.camera_id,
      p_pickup_at: booking.pickup_at,
      p_return_at: booking.return_at,
    });
    if (!quoteResult.error) quote = sanitizedQuote(quoteResult.data);
  }

  let contract: ContractReferenceRow | null = null;
  if (booking.current_contract_version_id) {
    const contractResult = await context.supabase
      .from("contract_versions")
      .select(ADMIN_CONTRACT_REFERENCE_COLUMNS)
      .eq("id", booking.current_contract_version_id)
      .maybeSingle();
    if (contractResult.error) return { status: "error" } as const;
    contract = (contractResult.data as ContractReferenceRow | null) ?? null;
  }

  let rejection: { reason: string; rejectedAt: string } | null = null;
  if (booking.state === "REJECTED") {
    const rejectionResult = await context.supabase
      .from("booking_state_history")
      .select(ADMIN_REJECTION_COLUMNS)
      .eq("booking_id", booking.id)
      .eq("to_state", "REJECTED")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rejectionResult.error) return { status: "error" } as const;
    const row = (rejectionResult.data as RejectionRow | null) ?? null;
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
    latestVerification: verification
      ? {
          documentExpirationDate: verification.document_expiration_date,
          status: verification.status,
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
      latestVerification: verification
        ? {
            decidedAt: verification.decided_at,
            documentExpirationDate: verification.document_expiration_date,
            idType: verification.id_type,
            status: verification.status,
            submittedAt: verification.submitted_at,
          }
        : null,
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
