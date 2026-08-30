import { z } from "zod";

export const PAYMENT_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;

export const gcashRecipientConfigurationSchema = z
  .object({
    enabled: z.boolean(),
    recipient_account: z.string().min(1).nullable(),
    recipient_name: z.string().min(1).nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type GcashRecipientConfiguration = z.infer<
  typeof gcashRecipientConfigurationSchema
>;

export const PAYMENT_REJECTION_REASONS = [
  "amount_mismatch",
  "duplicate_reference",
  "not_found_in_gcash",
  "reference_mismatch",
  "sender_mismatch",
  "unconfirmed_transfer",
] as const;

export type PaymentRejectionReason =
  (typeof PAYMENT_REJECTION_REASONS)[number];

export const PAYMENT_REJECTION_LABELS: Record<PaymentRejectionReason, string> = {
  amount_mismatch: "Amount does not match",
  duplicate_reference: "Reference was already reconciled",
  not_found_in_gcash: "Transfer was not found in GCash",
  reference_mismatch: "Reference does not match",
  sender_mismatch: "Sender does not match",
  unconfirmed_transfer: "Transfer could not be confirmed",
};

export const PAYMENT_REJECTION_MESSAGES: Record<
  PaymentRejectionReason | "other",
  string
> = {
  amount_mismatch:
    "The transfer amount did not match the booking total. Check the original payment instructions before submitting again.",
  duplicate_reference:
    "That GCash reference was already used for a verified transfer. Check the reference before submitting again.",
  not_found_in_gcash:
    "The transfer could not be found in the approved GCash account. Check its status in GCash before submitting again.",
  reference_mismatch:
    "The submitted reference did not match the transfer found in the approved GCash account.",
  sender_mismatch:
    "The submitted sender name did not match the transfer found in the approved GCash account.",
  unconfirmed_transfer:
    "The transfer could not be confirmed in the approved GCash account. Check its final status before submitting again.",
  other:
    "The transfer could not be verified. Check the original payment instructions or contact support without sharing a GCash PIN or one-time code.",
};

export const paymentProofPolicySchema = z
  .object({
    allowed_media_types: z.array(z.enum(PAYMENT_MEDIA_TYPES)).min(1),
    max_byte_size: z.number().int().positive().max(5 * 1024 * 1024),
    upload_intent_seconds: z.number().int().positive(),
  })
  .strict();

const paymentInstructionsSchema = z
  .object({
    currency: z.literal("PHP"),
    recipient_account: z.string().min(1),
    recipient_config_version: z.number().int().nonnegative(),
    recipient_name: z.string().min(1),
    rental_amount: z.number().nonnegative(),
    security_deposit: z.number().nonnegative(),
    total_due: z.number().positive(),
  })
  .strict();

export const paymentStateSchema = z
  .object({
    approval_deadline_at: z.string().nullable(),
    booking_id: z.uuid(),
    booking_state: z.string().min(1),
    can_submit: z.boolean(),
    instructions: paymentInstructionsSchema.nullable(),
    instructions_error: z
      .enum(["contract_inconsistent", "recipient_unavailable"])
      .nullable(),
    proof_policy: paymentProofPolicySchema,
    transaction: z
      .object({
        id: z.uuid(),
        proof_exists: z.boolean(),
        rejection_reason_code: z
          .enum(PAYMENT_REJECTION_REASONS)
          .nullable(),
        status: z.enum(["submitted", "verified", "rejected"]),
        submitted_at: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type PaymentState = z.infer<typeof paymentStateSchema>;

export const paymentSubmissionResponseSchema = z
  .object({
    booking_state: z.string().min(1),
    created: z.boolean(),
    status: z.enum(["submitted", "verified", "rejected"]),
    transaction_id: z.uuid(),
  })
  .strict();

export const paymentProofIntentResponseSchema = z
  .object({
    byte_size: z.number().int().positive().optional(),
    created: z.boolean().optional(),
    expires_at: z.string().min(1).optional(),
    id: z.uuid().optional(),
    media_type: z.string().min(1).optional(),
    object_path: z.string().min(1).optional(),
    proof_id: z.uuid().optional(),
    replacement: z.boolean().optional(),
    status: z.enum([
      "awaiting_upload",
      "cleaned",
      "cleanup_pending",
      "expired",
      "finalized",
    ]),
    transaction_id: z.uuid().optional(),
  })
  .strict();

export const paymentReviewQueueItemSchema = z
  .object({
    age_seconds: z.number().int().nonnegative(),
    approval_deadline_at: z.string().min(1),
    booking_id: z.uuid(),
    camera_name: z.string().min(1),
    currency: z.literal("PHP"),
    declared_amount: z.number().positive(),
    proof_exists: z.boolean(),
    reference: z.string().min(1),
    renter_legal_name: z.string().min(1),
    sender_name: z.string().min(1),
    submitted_at: z.string().min(1),
    transaction_id: z.uuid(),
  })
  .strict();

export const paymentReviewQueueSchema = z.array(paymentReviewQueueItemSchema);

export const paymentReviewDetailSchema = z
  .object({
    approval_deadline_at: z.string().min(1),
    booking_id: z.uuid(),
    booking_state: z.literal("PAYMENT_REVIEW"),
    camera_name: z.string().min(1),
    currency: z.literal("PHP"),
    declared_amount: z.number().positive(),
    proof: z
      .object({
        byte_size: z.number().int().positive(),
        finalized_at: z.string().min(1),
        media_type: z.enum(PAYMENT_MEDIA_TYPES),
        proof_id: z.uuid(),
      })
      .strict()
      .nullable(),
    recipient_account: z.string().min(1),
    recipient_name: z.string().min(1),
    reference: z.string().min(1),
    rental_amount: z.number().nonnegative(),
    renter_legal_name: z.string().min(1),
    security_deposit: z.number().nonnegative(),
    sender_name: z.string().min(1),
    submitted_at: z.string().min(1),
    total_due: z.number().positive(),
    transaction_id: z.uuid(),
  })
  .strict();

export const paymentProofAccessGrantSchema = z
  .object({
    expires_in_seconds: z.literal(60),
    object_path: z.string().min(1),
    proof_id: z.uuid(),
    transaction_id: z.uuid(),
  })
  .strict();

export const paymentDecisionResponseSchema = z
  .object({
    booking_state: z.enum(["CONFIRMED", "TO_PAY", "EXPIRED"]),
    created: z.boolean(),
    status: z.enum(["verified", "rejected"]),
    transaction_id: z.uuid(),
  })
  .strict();

export const paymentAccountingSummarySchema = z
  .object({
    currency: z.literal("PHP"),
    security_deposit_liability: z.number().nonnegative(),
    verified_rental_revenue: z.number().nonnegative(),
  })
  .strict();

export const paymentAuditHistorySchema = z.array(
  z
    .object({
      action: z.string().min(1),
      actor_user_id: z.uuid().nullable(),
      audit_id: z.number().int().positive(),
      occurred_at: z.string().min(1),
      operation_id: z.uuid(),
      outcome: z.string().min(1),
      purpose: z.string().min(1),
      transaction_id: z.uuid(),
    })
    .strict(),
);

export type PaymentReviewQueueItem = z.infer<
  typeof paymentReviewQueueItemSchema
>;
export type PaymentReviewDetail = z.infer<typeof paymentReviewDetailSchema>;
