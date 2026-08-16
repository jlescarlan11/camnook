import { z } from "zod";

import { CONDITION_PHOTO_MEDIA_TYPES } from "@/features/pickup/types";

export const RESOLUTION_BOOKING_STATES = [
  "FOR_REVIEW",
  "CONTRACT_PENDING",
  "TO_PAY",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "ACTIVE",
  "RETURN_REVIEW",
  "ISSUE_REVIEW",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
] as const;

export const resolutionBookingStateSchema = z.enum(RESOLUTION_BOOKING_STATES);
export const returnAccessoryStatusSchema = z.enum([
  "damaged",
  "missing",
  "returned",
]);
export const issueDecisionKindSchema = z.enum([
  "damage",
  "late_return",
  "missing_item",
  "mixed",
  "other",
]);

const moneySchema = z.number().finite().nonnegative();
const depositStatusSchema = z.enum([
  "none",
  "pending_refund",
  "refunded",
  "resolved_by_deduction",
]);

const conditionPhotoSummarySchema = z
  .object({
    byte_size: z.number().int().positive(),
    created_at: z.string().min(1),
    media_type: z.enum(CONDITION_PHOTO_MEDIA_TYPES),
    photo_id: z.uuid(),
    supersedes_photo_id: z.uuid().nullable(),
  })
  .strict();

const depositOutcomeSchema = z
  .object({
    deduction_amount: moneySchema,
    held_amount: moneySchema,
    refunded_amount: moneySchema,
    remaining_refund_liability: moneySchema,
    status: depositStatusSchema,
  })
  .strict();

const cancellationDecisionSchema = z
  .object({
    decided_at: z.string().min(1),
    decision_id: z.uuid().optional(),
    fee_amount: moneySchema,
    outcome: z.enum(["accepted", "declined"]),
    reason: z.string().min(2),
    refund_liability_amount: moneySchema,
  })
  .strict();

const cancellationSchema = z
  .object({
    acceptance_enabled: z.boolean().optional(),
    decision: cancellationDecisionSchema.nullable(),
    disposition: z.enum(["accepted", "declined", "pending"]),
    reason: z.string().min(2),
    request_id: z.uuid(),
    requested_at: z.string().min(1),
  })
  .strict();

const adminExpectedAccessorySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    replacement_value: moneySchema.optional(),
  })
  .strict();

const adminReturnAccessorySchema = adminExpectedAccessorySchema.extend({
  return_status: returnAccessoryStatusSchema,
});

const ownerReturnAccessorySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    return_status: returnAccessoryStatusSchema,
  })
  .strict();

const adminReturnInspectionSchema = z
  .object({
    accessories: z.array(adminReturnAccessorySchema),
    actual_at: z.string().min(1),
    camera_condition_summary: z.string().min(2),
    camera_has_damage: z.boolean(),
    condition_report_id: z.uuid(),
    expected_return_at: z.string().min(1),
    handoff_id: z.uuid(),
    has_missing_items: z.boolean(),
    late_return: z.boolean(),
    notes: z.string().nullable(),
    photos: z.array(conditionPhotoSummarySchema),
  })
  .strict();

const ownerReturnInspectionSchema = z
  .object({
    accessories: z.array(ownerReturnAccessorySchema),
    actual_at: z.string().min(1),
    camera_has_damage: z.boolean(),
    expected_return_at: z.string().min(1),
    has_missing_items: z.boolean(),
    late_return: z.boolean(),
    photos: z.array(conditionPhotoSummarySchema),
  })
  .strict();

export const resolutionQueuesSchema = z
  .object({
    cancellation_queue: z.array(
      z
        .object({
          acceptance_enabled: z.boolean(),
          booking_id: z.uuid(),
          booking_state: resolutionBookingStateSchema,
          camera_name: z.string().min(1),
          reason: z.string().min(2),
          renter_legal_name: z.string().min(1),
          request_id: z.uuid(),
          requested_at: z.string().min(1),
        })
        .strict(),
    ),
    deposit_queue: z.array(
      z
        .object({
          booking_id: z.uuid(),
          camera_name: z.string().min(1),
          deduction_amount: moneySchema,
          held_amount: moneySchema,
          refunded_amount: moneySchema,
          remaining_refund_liability: moneySchema,
          renter_legal_name: z.string().min(1),
          status: depositStatusSchema,
        })
        .strict(),
    ),
    issue_queue: z.array(
      z
        .object({
          actual_return_at: z.string().min(1),
          booking_id: z.uuid(),
          camera_name: z.string().min(1),
          evidence_count: z.number().int().nonnegative(),
          has_damage: z.boolean(),
          has_missing_items: z.boolean(),
          late_return: z.boolean(),
          renter_legal_name: z.string().min(1),
        })
        .strict(),
    ),
    return_queue: z.array(
      z
        .object({
          actual_pickup_at: z.string().min(1),
          booking_id: z.uuid(),
          camera_name: z.string().min(1),
          expected_return_at: z.string().min(1),
          renter_legal_name: z.string().min(1),
          renter_phone: z.string().min(1),
          urgency: z.enum(["due_today", "overdue", "upcoming"]),
        })
        .strict(),
    ),
  })
  .strict();

export const resolutionDetailSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: resolutionBookingStateSchema,
    camera: z
      .object({
        id: z.uuid(),
        name: z.string().min(1),
      })
      .strict(),
    cancellation: cancellationSchema.nullable(),
    deposit: depositOutcomeSchema,
    expected_accessories: z.array(adminExpectedAccessorySchema),
    issue_decision: z
      .object({
        customer_explanation: z.string().min(2),
        decided_at: z.string().min(1),
        decision_id: z.uuid(),
        decision_kind: issueDecisionKindSchema,
        deduction_amount: moneySchema,
        internal_reason: z.string().min(2),
      })
      .strict()
      .nullable(),
    issue_notes: z.array(
      z
        .object({
          created_at: z.string().min(1),
          note: z.string().min(2),
          note_id: z.uuid(),
        })
        .strict(),
    ),
    pickup_at: z.string().min(1),
    refunds: z.array(
      z
        .object({
          amount: moneySchema,
          entry_kind: z.enum(["refund", "reversal"]),
          external_moved_at: z.string().min(1),
          reference_last4: z.string().length(4),
          refund_record_id: z.uuid(),
          reversal_of_refund_record_id: z.uuid().nullable(),
          reversal_reason: z.string().nullable(),
        })
        .strict(),
    ),
    renter: z
      .object({
        legal_name: z.string().min(1),
        phone: z.string().min(1),
      })
      .strict(),
    return_at: z.string().min(1),
    return_inspection: adminReturnInspectionSchema.nullable(),
  })
  .strict();

export const myResolutionStateSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: resolutionBookingStateSchema,
    can_request_cancellation: z.boolean(),
    cancellation: cancellationSchema.omit({ acceptance_enabled: true }).nullable(),
    deposit: depositOutcomeSchema,
    issue_decision: z
      .object({
        customer_explanation: z.string().min(2),
        decided_at: z.string().min(1),
        decision_kind: issueDecisionKindSchema,
        deduction_amount: moneySchema,
      })
      .strict()
      .nullable(),
    return_inspection: ownerReturnInspectionSchema.nullable(),
  })
  .strict();

export const cancellationActionResponseSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: resolutionBookingStateSchema,
    created: z.boolean(),
    disposition: z.enum(["accepted", "declined", "pending"]).optional(),
    outcome: z.enum(["accepted", "declined"]).optional(),
    request_id: z.uuid(),
    decision_id: z.uuid().optional(),
  })
  .strict();

export const returnRecordResponseSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: resolutionBookingStateSchema,
    condition_report_id: z.uuid(),
    created: z.boolean(),
    handoff_id: z.uuid(),
  })
  .strict();

export const returnReviewResponseSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: z.enum(["COMPLETED", "ISSUE_REVIEW"]),
    created: z.boolean(),
    outcome: z.enum(["clear", "issue"]),
  })
  .strict();

export const issueNoteResponseSchema = z
  .object({ booking_id: z.uuid(), created: z.boolean(), note_id: z.uuid() })
  .strict();

export const issueResolutionResponseSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: z.literal("COMPLETED"),
    created: z.boolean(),
    decision_id: z.uuid(),
    deduction_amount: moneySchema,
  })
  .strict();

export const refundMovementResponseSchema = z
  .object({
    amount: moneySchema,
    booking_id: z.uuid(),
    created: z.boolean(),
    entry_kind: z.enum(["refund", "reversal"]),
    refund_record_id: z.uuid(),
    remaining_liability: moneySchema.optional(),
    transaction_id: z.uuid(),
  })
  .strict();

export type ResolutionDetail = z.infer<typeof resolutionDetailSchema>;
export type MyResolutionState = z.infer<typeof myResolutionStateSchema>;
export type ResolutionQueues = z.infer<typeof resolutionQueuesSchema>;
