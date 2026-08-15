import { z } from "zod";

export const ACCEPTED_ID_TYPES = [
  "philippine_passport",
  "philsys_id",
  "drivers_license",
  "umid",
] as const;

export type AcceptedIdType = (typeof ACCEPTED_ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<AcceptedIdType, string> = {
  drivers_license: "Philippine driver’s license",
  philippine_passport: "Philippine passport",
  philsys_id: "PhilSys ID or ePhilID",
  umid: "Unified Multi-Purpose ID (UMID)",
};

export const VERIFICATION_REJECTION_REASONS = [
  "details_do_not_match",
  "document_expired",
  "document_not_readable",
  "masking_incomplete",
  "unsupported_document",
] as const;

export type VerificationRejectionReason =
  (typeof VERIFICATION_REJECTION_REASONS)[number];

export const VERIFICATION_REJECTION_LABELS: Record<
  VerificationRejectionReason,
  string
> = {
  details_do_not_match: "Submitted details do not match",
  document_expired: "Document is expired",
  document_not_readable: "Document is not readable",
  masking_incomplete: "Sensitive details need more masking",
  unsupported_document: "Document type is not supported",
};

export const VERIFICATION_REJECTION_MESSAGES: Record<
  VerificationRejectionReason | "other",
  string
> = {
  details_do_not_match:
    "The visible name or document details did not match your account. Check your profile and upload a corrected masked image.",
  document_expired:
    "The submitted document was already expired. Upload a masked image of a current accepted document.",
  document_not_readable:
    "The permitted name, portrait, document type, or expiry could not be read. Upload a clearer masked image.",
  masking_incomplete:
    "The image showed information that should be covered. Mask the ID number, address, birth date, signature, QR/barcode, and machine-readable zone, then upload again.",
  unsupported_document:
    "This document cannot be used for review. Upload one of the accepted ID types listed below.",
  other:
    "This submission could not be verified. Upload a new masked image or contact support without emailing an ID file.",
};

export const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
] as const;

export const verificationPolicySchema = z.object({
  allowed_id_types: z.array(z.enum(ACCEPTED_ID_TYPES)).min(1),
  allowed_media_types: z.array(z.enum(ACCEPTED_MEDIA_TYPES)).min(1),
  document_retention_days: z.number().int().positive(),
  enabled: z.boolean(),
  max_byte_size: z.number().int().positive().max(5 * 1024 * 1024),
  policy_version: z.string().min(1),
  privacy_notice_version: z.string().min(1),
  upload_intent_seconds: z.number().int().positive(),
});

export type VerificationPolicy = z.infer<typeof verificationPolicySchema>;

export const verificationIntentResponseSchema = z.object({
  byte_size: z.number().int().positive().optional(),
  document_id: z.uuid().optional(),
  expires_at: z.string().optional(),
  id: z.uuid().optional(),
  media_type: z.string().optional(),
  object_path: z.string().min(1).optional(),
  record_id: z.uuid().optional(),
  status: z.enum([
    "awaiting_upload",
    "cleanup_pending",
    "cleaned",
    "expired",
    "finalized",
    "pending",
  ]),
});

export const verificationDeletionResponseSchema = z.object({
  document_id: z.uuid(),
  eligible: z.boolean().optional(),
  object_path: z.string().min(1).optional(),
  retention_until: z.string().optional(),
  status: z.enum(["scheduled", "eligible", "deleted"]),
  verified_deleted_at: z.string().optional(),
});

const verificationDocumentStateSchema = z.object({
  byte_size: z.number().int().positive(),
  deleted_at: z.string().nullable().optional(),
  deletion_eligible: z.boolean(),
  deletion_requested_at: z.string().nullable().optional(),
  finalized_at: z.string().nullable().optional(),
  id: z.uuid(),
  legal_hold: z.boolean(),
  media_type: z.string(),
  retention_until: z.string().nullable(),
  superseded_at: z.string().nullable().optional(),
  verified_deleted_at: z.string().nullable().optional(),
});

export const verificationStateSchema = z.object({
  document: verificationDocumentStateSchema.nullable(),
  documents: z.array(verificationDocumentStateSchema),
  intent: z
    .object({
      byte_size: z.number().int().positive(),
      document_id: z.uuid(),
      expires_at: z.string(),
      id: z.uuid(),
      media_type: z.string(),
      record_id: z.uuid(),
      status: z.enum(["awaiting_upload", "cleanup_pending", "expired"]),
    })
    .nullable(),
  policy: verificationPolicySchema,
  record: z
    .object({
      decided_at: z.string().nullable().optional(),
      document_expiration_date: z.string().nullable().optional(),
      id: z.uuid(),
      id_type: z.string(),
      rejection_reason_code: z
        .enum([...VERIFICATION_REJECTION_REASONS, "other"])
        .nullable()
        .optional(),
      status: z.enum(["pending", "verified", "rejected", "expired"]),
      submitted_at: z.string(),
      supersedes_id: z.uuid().nullable().optional(),
    })
    .nullable(),
});

export type VerificationState = z.infer<typeof verificationStateSchema>;

export const verificationReviewQueueItemSchema = z
  .object({
    age_seconds: z.number().int().nonnegative(),
    id_type: z.enum(ACCEPTED_ID_TYPES),
    record_id: z.uuid(),
    renter_legal_name: z.string().min(1),
    submitted_at: z.string().min(1),
  })
  .strict();

export const verificationReviewQueueSchema = z.array(
  verificationReviewQueueItemSchema,
);

export const verificationReviewDetailSchema = z
  .object({
    byte_size: z.number().int().positive(),
    id_type: z.enum(ACCEPTED_ID_TYPES),
    media_type: z.enum(ACCEPTED_MEDIA_TYPES),
    record_id: z.uuid(),
    renter_legal_name: z.string().min(1),
    retention_until: z.string().min(1),
    status: z.literal("pending"),
    submitted_at: z.string().min(1),
  })
  .strict();

export const verificationEvidenceAccessGrantSchema = z
  .object({
    document_id: z.uuid(),
    expires_in_seconds: z.literal(60),
    object_path: z.string().min(1),
    record_id: z.uuid(),
  })
  .strict();

export const verificationDecisionResponseSchema = z
  .object({
    decided_at: z.string().min(1),
    record_id: z.uuid(),
    status: z.enum(["verified", "rejected"]),
  })
  .strict();

export type VerificationReviewQueueItem = z.infer<
  typeof verificationReviewQueueItemSchema
>;
export type VerificationReviewDetail = z.infer<
  typeof verificationReviewDetailSchema
>;
