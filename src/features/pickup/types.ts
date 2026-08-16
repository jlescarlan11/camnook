import { z } from "zod";

export const CONDITION_PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;

export const pickupEligibilitySchema = z
  .object({
    booking_confirmed: z.boolean(),
    contract_current_signed: z.boolean(),
    eligible: z.boolean(),
    payment_verified: z.boolean(),
    profile_active: z.boolean(),
    verification_current: z.boolean(),
  })
  .strict();

const pickupAccessorySchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();

const conditionPhotoSummarySchema = z
  .object({
    byte_size: z.number().int().positive(),
    created_at: z.string().min(1),
    media_type: z.enum(CONDITION_PHOTO_MEDIA_TYPES),
    photo_id: z.uuid(),
  })
  .strict();

export const pickupQueueSchema = z.array(
  z
    .object({
      accessory_count: z.number().int().nonnegative(),
      booking_id: z.uuid(),
      camera_name: z.string().min(1),
      pickup_at: z.string().min(1),
      readiness: pickupEligibilitySchema,
      renter_legal_name: z.string().min(1),
      required_checks: z.tuple([
        z.literal("named_renter_present"),
        z.literal("original_id_checked"),
        z.literal("original_id_matched"),
        z.literal("camera_serial_confirmed"),
        z.literal("included_accessories_confirmed"),
        z.literal("condition_report_complete"),
      ]),
      return_at: z.string().min(1),
      verification_expiration_date: z.string().min(1),
    })
    .strict(),
);

export const pickupDetailSchema = z
  .object({
    accessories: z.array(pickupAccessorySchema),
    booking_id: z.uuid(),
    booking_state: z.enum(["CONFIRMED", "ACTIVE"]),
    eligibility: pickupEligibilitySchema,
    handoff: z
      .object({
        accessory_checklist_completed: z.literal(true),
        actual_at: z.string().min(1),
        camera_serial_checked: z.literal(true),
        condition_report_id: z.uuid(),
        condition_summary: z.string().min(2),
        handoff_id: z.uuid(),
        named_renter_present: z.literal(true),
        original_id_checked: z.literal(true),
        original_id_matched: z.literal(true),
        photos: z.array(conditionPhotoSummarySchema),
      })
      .strict()
      .nullable(),
    renter_legal_name: z.string().min(1),
    verification: z
      .object({
        document_expiration_date: z.string().nullable(),
        id_type: z.string().min(1),
        record_id: z.uuid(),
        status: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const pickupCompletionResponseSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: z.literal("ACTIVE"),
    condition_report_id: z.uuid(),
    created: z.boolean(),
    handoff_id: z.uuid(),
  })
  .strict();

export const conditionPhotoIntentSchema = z
  .object({
    booking_id: z.uuid().optional(),
    byte_size: z.number().int().positive().optional(),
    condition_report_id: z.uuid().optional(),
    expires_at: z.string().min(1).optional(),
    id: z.uuid().optional(),
    media_type: z.enum(CONDITION_PHOTO_MEDIA_TYPES).optional(),
    object_path: z.string().min(1).optional(),
    photo_id: z.uuid().optional(),
    status: z.enum([
      "awaiting_upload",
      "cleaned",
      "cleanup_pending",
      "expired",
      "finalized",
    ]),
  })
  .strict();

export const conditionPhotoFinalizeSchema = z
  .object({
    booking_id: z.uuid(),
    condition_report_id: z.uuid(),
    created: z.boolean(),
    photo_id: z.uuid(),
    status: z.literal("finalized"),
  })
  .strict();

export const conditionPhotoAccessGrantSchema = z
  .object({
    booking_id: z.uuid(),
    condition_report_id: z.uuid(),
    expires_in_seconds: z.literal(60),
    object_path: z.string().min(1),
    photo_id: z.uuid(),
  })
  .strict();

export const myPickupStateSchema = z
  .object({
    booking_id: z.uuid(),
    booking_state: z.string().min(1),
    handoff: z
      .object({
        accessory_checklist_completed: z.literal(true),
        actual_at: z.string().min(1),
        camera_serial_checked: z.literal(true),
        condition_photo_count: z.number().int().nonnegative(),
        condition_report_complete: z.literal(true),
        named_renter_present: z.literal(true),
        original_id_checked: z.literal(true),
        original_id_matched: z.literal(true),
        photos: z.array(conditionPhotoSummarySchema),
      })
      .strict()
      .nullable(),
    pickup_at: z.string().min(1),
    return_at: z.string().min(1),
    timeline: z.array(
      z
        .object({
          from_state: z.string().nullable(),
          occurred_at: z.string().min(1),
          reason_code: z.string().min(1),
          to_state: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const activeRentalQueueSchema = z.array(
  z
    .object({
      actual_pickup_at: z.string().min(1),
      booking_id: z.uuid(),
      camera_name: z.string().min(1),
      expected_return_at: z.string().min(1),
      renter_legal_name: z.string().min(1),
      renter_phone: z.string().min(1),
      urgency: z.enum(["overdue", "due_today", "upcoming"]),
    })
    .strict(),
);

export const pickupInstructionsSchema = z
  .object({
    contact: z.string().trim().min(2).max(240),
    location: z.string().trim().min(2).max(500),
    process: z.string().trim().min(2).max(1000),
  })
  .strict();

export type PickupDetail = z.infer<typeof pickupDetailSchema>;
export type MyPickupState = z.infer<typeof myPickupStateSchema>;
