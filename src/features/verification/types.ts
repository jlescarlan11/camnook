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

export const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
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
      id: z.uuid(),
      id_type: z.string(),
      status: z.enum(["pending", "verified", "rejected", "expired"]),
      submitted_at: z.string(),
    })
    .nullable(),
});

export type VerificationState = z.infer<typeof verificationStateSchema>;
