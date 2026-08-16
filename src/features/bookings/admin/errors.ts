import { z } from "zod";

export type ApprovalErrorCategory =
  | "availability_conflict"
  | "camera_unavailable"
  | "indeterminate"
  | "invalid_period"
  | "not_found"
  | "price_unrepresentable"
  | "profile_inactive"
  | "stale"
  | "template_invalid"
  | "template_unavailable"
  | "unauthorized";

export type RejectionErrorCategory =
  | "indeterminate"
  | "stale"
  | "unauthorized";

type ProviderError = { code?: string; message?: string };

const approvalErrorContracts = new Map<string, ApprovalErrorCategory>([
  ["42501/approval_unauthorized", "unauthorized"],
  ["P0002/approval_booking_not_found", "not_found"],
  ["P0001/approval_stale_booking_state", "stale"],
  ["22023/approval_profile_inactive", "profile_inactive"],
  ["22023/approval_camera_unavailable", "camera_unavailable"],
  ["22023/approval_template_unavailable", "template_unavailable"],
  ["22023/approval_template_invalid", "template_invalid"],
  ["22023/approval_invalid_period", "invalid_period"],
  ["22023/approval_price_unrepresentable", "price_unrepresentable"],
  ["23P01/approval_overlap", "availability_conflict"],
]);

const rejectionErrorContracts = new Map<string, RejectionErrorCategory>([
  ["42501/admin authorization required", "unauthorized"],
  [
    "P0001/booking state changed or transition precondition failed",
    "stale",
  ],
]);

function errorContractKey(error: ProviderError) {
  return `${error.code ?? ""}/${error.message ?? ""}`;
}

export function mapApprovalError(error: ProviderError) {
  return approvalErrorContracts.get(errorContractKey(error)) ?? "indeterminate";
}

export function mapRejectionError(error: ProviderError) {
  return rejectionErrorContracts.get(errorContractKey(error)) ?? "indeterminate";
}

const bookingIdSchema = z.uuid();
const rejectionReasonSchema = z.string().trim().min(2).max(1000);

export function validateDecisionInput(input: {
  bookingId: string;
  reason?: string;
}) {
  const bookingId = bookingIdSchema.safeParse(input.bookingId);
  if (!bookingId.success) {
    return {
      fieldErrors: { bookingId: "This booking reference is invalid." },
      ok: false,
    } as const;
  }

  if (input.reason === undefined) {
    return { bookingId: bookingId.data, ok: true } as const;
  }

  const reason = rejectionReasonSchema.safeParse(input.reason);
  if (!reason.success) {
    return {
      fieldErrors: {
        reason: "Enter a reason between 2 and 1000 characters.",
      },
      ok: false,
    } as const;
  }

  return {
    bookingId: bookingId.data,
    ok: true,
    reason: reason.data,
  } as const;
}
