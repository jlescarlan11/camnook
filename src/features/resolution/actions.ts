"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stringFormValue } from "@/features/bookings/actions/state";
import { parseManilaWallClock } from "@/features/bookings/manila-time";
import {
  AdminAuthorizationRequiredError,
  isAuthenticationError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import {
  AuthenticationRequiredError,
  requireUser,
} from "@/lib/auth/require-user";

import {
  cancellationActionResponseSchema,
  issueDecisionKindSchema,
  issueNoteResponseSchema,
  issueResolutionResponseSchema,
  refundMovementResponseSchema,
  returnAccessoryStatusSchema,
  returnRecordResponseSchema,
  returnReviewResponseSchema,
} from "./types";

export type ResolutionActionState = {
  error?:
    | "blocked"
    | "indeterminate"
    | "invalid"
    | "policy_unavailable"
    | "stale"
    | "unauthorized";
  fieldErrors?: Record<string, string>;
  result?:
    | "cancelled"
    | "declined"
    | "issue_opened"
    | "note_saved"
    | "recorded"
    | "refund_recorded"
    | "requested"
    | "resolved"
    | "reversed"
    | "returned_clear";
  status: "error" | "idle" | "success";
};

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

const idSchema = z.uuid();
const reasonSchema = z.string().trim().min(2).max(1000);
const longTextSchema = z.string().trim().min(2).max(2000);
const customerTextSchema = z.string().trim().min(2).max(500);
const serialSchema = z.string().trim().min(1).max(160);
const partySchema = z.string().trim().min(2).max(160);
const referenceSchema = z
  .string()
  .trim()
  .min(4)
  .max(120)
  .regex(/^[A-Za-z0-9 -]+$/);

function parseMoney(value: string, allowZero: boolean) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(Math.round(amount * 100))) return null;
  return amount > 0 || (allowZero && amount === 0) ? amount : null;
}

function isAdminAuthorizationDenial(error: unknown) {
  return (
    isAuthenticationError(error) ||
    error instanceof AdminAuthorizationRequiredError
  );
}

function mapResolutionError(error: { code?: string } | null) {
  if (!error) return "indeterminate" as const;
  if (error.code === "42501") return "unauthorized" as const;
  if (error.code === "0A000") return "policy_unavailable" as const;
  if (error.code === "40001" || error.code === "P0002") {
    return "stale" as const;
  }
  if (error.code === "22023") return "invalid" as const;
  if (error.code === "23505" || error.code === "23514" || error.code === "55000") {
    return "blocked" as const;
  }
  return "indeterminate" as const;
}

function revalidateResolutionViews(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/account");
  revalidatePath(`/account/bookings/${bookingId}`);
}

async function requireResolutionAdmin(): Promise<
  | { context: AdminContext; error?: never }
  | {
      context?: never;
      error: "indeterminate" | "unauthorized";
    }
> {
  try {
    return { context: await requireAdmin() } as const;
  } catch (error) {
    return {
      error: isAdminAuthorizationDenial(error)
        ? ("unauthorized" as const)
        : ("indeterminate" as const),
    } as const;
  }
}

function identifiers(formData: FormData) {
  const bookingId = stringFormValue(formData, "bookingId");
  const operationId = stringFormValue(formData, "operationId");
  if (
    !idSchema.safeParse(bookingId).success ||
    !idSchema.safeParse(operationId).success
  ) {
    return null;
  }
  return { bookingId, operationId };
}

export async function requestCancellation(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const reason = reasonSchema.safeParse(stringFormValue(formData, "reason"));
  if (!ids || !reason.success) {
    return {
      error: "invalid",
      fieldErrors: reason.success
        ? undefined
        : { reason: "Enter a 2–1,000 character cancellation reason." },
      status: "error",
    };
  }

  try {
    const context = await requireUser();
    const result = await context.supabase
      .schema("api")
      .rpc("request_cancellation_resolution", {
        p_booking_id: ids.bookingId,
        p_operation_id: ids.operationId,
        p_reason: reason.data,
      });
    const parsed = cancellationActionResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "requested", status: "success" };
  } catch (error) {
    revalidateResolutionViews(ids.bookingId);
    return {
      error:
        error instanceof AuthenticationRequiredError
          ? "unauthorized"
          : "indeterminate",
      status: "error",
    };
  }
}

export async function decideCancellation(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const requestId = stringFormValue(formData, "requestId");
  const decision = stringFormValue(formData, "decision");
  const reason = reasonSchema.safeParse(stringFormValue(formData, "reason"));
  if (
    !ids ||
    !idSchema.safeParse(requestId).success ||
    !["accept", "decline"].includes(decision) ||
    !reason.success
  ) {
    return { error: "invalid", status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }

  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("decide_cancellation_resolution", {
        p_accept: decision === "accept",
        p_fee_amount: 0,
        p_operation_id: ids.operationId,
        p_reason: reason.data,
        p_refund_liability_amount: 0,
        p_request_id: requestId,
      });
    const parsed = cancellationActionResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return {
      result: decision === "accept" ? "cancelled" : "declined",
      status: "success",
    };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function recordReturn(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const actualAt = parseManilaWallClock(stringFormValue(formData, "actualAt"));
  const cameraSerial = serialSchema.safeParse(
    stringFormValue(formData, "cameraSerial"),
  );
  const conditionSummary = longTextSchema.safeParse(
    stringFormValue(formData, "conditionSummary"),
  );
  const notesValue = stringFormValue(formData, "notes");
  const notes = z.string().trim().max(2000).safeParse(notesValue);
  const accessoryIds = formData.getAll("accessoryId");
  const accessories = accessoryIds.map((value) => ({
    id: value,
    status: stringFormValue(formData, `accessoryStatus-${String(value)}`),
  }));
  const parsedAccessories = z
    .array(
      z
        .object({ id: z.uuid(), status: returnAccessoryStatusSchema })
        .strict(),
    )
    .safeParse(accessories);
  const fieldErrors: Record<string, string> = {};

  if (!actualAt.ok) fieldErrors.actualAt = "Enter the actual return time.";
  if (!cameraSerial.success) fieldErrors.cameraSerial = "Enter the observed serial.";
  if (!conditionSummary.success) {
    fieldErrors.conditionSummary = "Enter a 2–2,000 character condition report.";
  }
  if (!notes.success) fieldErrors.notes = "Notes cannot exceed 2,000 characters.";
  if (
    !parsedAccessories.success ||
    new Set(accessoryIds).size !== accessoryIds.length
  ) {
    fieldErrors.accessories = "Record one return status for every inclusion.";
  }
  if (
    !ids ||
    !actualAt.ok ||
    !cameraSerial.success ||
    !conditionSummary.success ||
    !notes.success ||
    !parsedAccessories.success ||
    Object.keys(fieldErrors).length > 0
  ) {
    return { error: "invalid", fieldErrors, status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }

  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("record_return_inspection", {
        p_accessory_results: parsedAccessories.data,
        p_actual_at: actualAt.instant,
        p_booking_id: ids.bookingId,
        p_camera_has_damage: formData.get("cameraHasDamage") === "yes",
        p_camera_serial: cameraSerial.data,
        p_condition_summary: conditionSummary.data,
        p_notes: notes.data,
        p_operation_id: ids.operationId,
      });
    const parsed = returnRecordResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "recorded", status: "success" };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function decideReturnReview(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const outcome = stringFormValue(formData, "outcome");
  const noteValue = stringFormValue(formData, "note");
  const note = z.string().trim().max(2000).safeParse(noteValue);
  if (
    !ids ||
    !["clear", "issue"].includes(outcome) ||
    !note.success ||
    (outcome === "issue" && note.data.length < 2)
  ) {
    return { error: "invalid", status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }

  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("decide_return_inspection", {
        p_booking_id: ids.bookingId,
        p_note: note.data,
        p_operation_id: ids.operationId,
        p_outcome: outcome,
      });
    const parsed = returnReviewResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return {
      result: outcome === "clear" ? "returned_clear" : "issue_opened",
      status: "success",
    };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function addIssueNote(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const note = longTextSchema.safeParse(stringFormValue(formData, "note"));
  if (!ids || !note.success) return { error: "invalid", status: "error" };

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }
  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("add_return_issue_note", {
        p_booking_id: ids.bookingId,
        p_note: note.data,
        p_operation_id: ids.operationId,
      });
    const parsed = issueNoteResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "note_saved", status: "success" };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function resolveIssue(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const kind = issueDecisionKindSchema.safeParse(
    stringFormValue(formData, "decisionKind"),
  );
  const deductionAmount = parseMoney(
    stringFormValue(formData, "deductionAmount"),
    true,
  );
  const internalReason = longTextSchema.safeParse(
    stringFormValue(formData, "internalReason"),
  );
  const customerExplanation = customerTextSchema.safeParse(
    stringFormValue(formData, "customerExplanation"),
  );
  if (
    !ids ||
    !kind.success ||
    deductionAmount === null ||
    !internalReason.success ||
    !customerExplanation.success
  ) {
    return { error: "invalid", status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }
  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("resolve_return_issue", {
        p_booking_id: ids.bookingId,
        p_customer_explanation: customerExplanation.data,
        p_decision_kind: kind.data,
        p_deduction_amount: deductionAmount,
        p_internal_reason: internalReason.data,
        p_operation_id: ids.operationId,
      });
    const parsed = issueResolutionResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "resolved", status: "success" };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function recordExternalRefund(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const amount = parseMoney(stringFormValue(formData, "amount"), false);
  const reference = referenceSchema.safeParse(
    stringFormValue(formData, "reference"),
  );
  const recipient = partySchema.safeParse(
    stringFormValue(formData, "recipientName"),
  );
  const movedAt = parseManilaWallClock(
    stringFormValue(formData, "externalMovedAt"),
  );
  if (
    !ids ||
    amount === null ||
    !reference.success ||
    !recipient.success ||
    !movedAt.ok
  ) {
    return { error: "invalid", status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }
  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("record_external_refund", {
        p_amount: amount,
        p_booking_id: ids.bookingId,
        p_external_moved_at: movedAt.instant,
        p_operation_id: ids.operationId,
        p_recipient_name: recipient.data,
        p_reference: reference.data,
      });
    const parsed = refundMovementResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "refund_recorded", status: "success" };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export async function reverseExternalRefund(
  _state: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const ids = identifiers(formData);
  const refundRecordId = stringFormValue(formData, "refundRecordId");
  const reference = referenceSchema.safeParse(
    stringFormValue(formData, "reference"),
  );
  const counterparty = partySchema.safeParse(
    stringFormValue(formData, "counterpartyName"),
  );
  const reason = reasonSchema.safeParse(stringFormValue(formData, "reason"));
  const movedAt = parseManilaWallClock(
    stringFormValue(formData, "externalMovedAt"),
  );
  if (
    !ids ||
    !idSchema.safeParse(refundRecordId).success ||
    !reference.success ||
    !counterparty.success ||
    !reason.success ||
    !movedAt.ok
  ) {
    return { error: "invalid", status: "error" };
  }

  const authorization = await requireResolutionAdmin();
  if (!authorization.context) {
    return { error: authorization.error, status: "error" };
  }
  try {
    const result = await authorization.context.supabase
      .schema("api")
      .rpc("reverse_external_refund", {
        p_counterparty_name: counterparty.data,
        p_external_moved_at: movedAt.instant,
        p_operation_id: ids.operationId,
        p_reason: reason.data,
        p_reference: reference.data,
        p_refund_record_id: refundRecordId,
      });
    const parsed = refundMovementResponseSchema.safeParse(result.data);
    revalidateResolutionViews(ids.bookingId);
    if (result.error) {
      return { error: mapResolutionError(result.error), status: "error" };
    }
    if (!parsed.success || parsed.data.booking_id !== ids.bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { result: "reversed", status: "success" };
  } catch {
    revalidateResolutionViews(ids.bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

export type { AdminContext };
