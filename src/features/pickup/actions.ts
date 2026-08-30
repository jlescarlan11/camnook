"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stringFormValue } from "@/features/bookings/actions/state";
import { parseManilaWallClock } from "@/features/bookings/manila-time";
import {
  AdminAuthorizationRequiredError,
  isAuthenticationError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  CONDITION_PHOTO_MEDIA_TYPES,
  conditionPhotoAccessGrantSchema,
  conditionPhotoFinalizeSchema,
  conditionPhotoIntentSchema,
  pickupCompletionResponseSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export type PickupCompletionActionState = {
  error?: "blocked" | "indeterminate" | "invalid" | "stale" | "unauthorized";
  fieldErrors?: {
    actualAt?: string;
    accessories?: string;
    cameraSerial?: string;
    conditionSummary?: string;
    notes?: string;
    originalId?: string;
    renter?: string;
  };
  status: "error" | "idle" | "success";
};

export type ConditionPhotoActionState = {
  error?: "indeterminate" | "invalid" | "stale" | "unauthorized" | "unavailable";
  expiresAt?: string;
  fieldErrors?: { photo?: string };
  photoId?: string;
  result?: "saved";
  signedUrl?: string;
  status: "error" | "idle" | "success";
};

const idSchema = z.uuid();
const serialSchema = z.string().trim().min(1).max(160);
const conditionSchema = z.string().trim().min(2).max(2000);
const notesSchema = z.string().trim().max(2000);

function isAdminAuthorizationDenial(error: unknown) {
  return (
    isAuthenticationError(error) ||
    error instanceof AdminAuthorizationRequiredError
  );
}

function revalidatePickupViews(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/account");
  revalidatePath(`/account/bookings/${bookingId}`);
}

function mapPickupError(error: { code?: string } | null) {
  if (!error) return "indeterminate" as const;
  if (error.code === "42501") return "unauthorized" as const;
  if (error.code === "40001" || error.code === "P0002") {
    return "stale" as const;
  }
  if (error.code === "22023") return "invalid" as const;
  if (error.code === "23514" || error.code === "55000") {
    return "blocked" as const;
  }
  return "indeterminate" as const;
}

function mapPhotoAccessError(error: { code?: string } | null) {
  const mapped = mapPickupError(error);
  return mapped === "blocked" ? "unavailable" : mapped;
}

export async function completePickup(
  _state: PickupCompletionActionState,
  formData: FormData,
): Promise<PickupCompletionActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const operationId = stringFormValue(formData, "operationId");
  const actualAtValue = stringFormValue(formData, "actualAt");
  const actualAt = parseManilaWallClock(actualAtValue);
  const cameraSerial = serialSchema.safeParse(
    stringFormValue(formData, "cameraSerial"),
  );
  const conditionSummary = conditionSchema.safeParse(
    stringFormValue(formData, "conditionSummary"),
  );
  const notes = notesSchema.safeParse(stringFormValue(formData, "notes"));
  const accessoryValues = formData.getAll("accessoryId");
  const accessoryIds = z.array(z.uuid()).safeParse(accessoryValues);
  const fieldErrors: PickupCompletionActionState["fieldErrors"] = {};

  if (!idSchema.safeParse(bookingId).success || !idSchema.safeParse(operationId).success) {
    return { error: "invalid", status: "error" };
  }
  if (!actualAt.ok) fieldErrors.actualAt = "Enter a valid pickup date and time.";
  if (!cameraSerial.success) {
    fieldErrors.cameraSerial = "Enter the serial observed on the camera.";
  }
  if (!conditionSummary.success) {
    fieldErrors.conditionSummary = "Record a 2–2,000 character starting condition.";
  }
  if (!notes.success) {
    fieldErrors.notes = "Notes must be no longer than 2,000 characters.";
  }
  if (formData.get("namedRenter") !== "confirmed-named-renter") {
    fieldErrors.renter = "Confirm that the named renter is physically present.";
  }
  if (
    formData.get("originalIdChecked") !== "confirmed-original-id" ||
    formData.get("originalIdMatched") !== "confirmed-id-match"
  ) {
    fieldErrors.originalId = "Check the original ID and confirm that it matches.";
  }
  if (!accessoryIds.success || new Set(accessoryValues).size !== accessoryValues.length) {
    fieldErrors.accessories = "Confirm each included accessory exactly once.";
  }
  if (
    Object.keys(fieldErrors).length > 0 ||
    !actualAt.ok ||
    !cameraSerial.success ||
    !conditionSummary.success ||
    !notes.success ||
    !accessoryIds.success
  ) {
    return { error: "invalid", fieldErrors, status: "error" };
  }

  let context: AdminContext;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      error: isAdminAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const result = await context.supabase.schema("api").rpc("complete_pickup", {
      p_accessory_ids: accessoryIds.data,
      p_actual_at: actualAt.instant,
      p_booking_id: bookingId,
      p_camera_serial: cameraSerial.data,
      p_condition_summary: conditionSummary.data,
      p_named_renter_present: true,
      p_notes: notes.data,
      p_operation_id: operationId,
      p_original_id_checked: true,
      p_original_id_matched: true,
    });
    const completed = pickupCompletionResponseSchema.safeParse(result.data);
    revalidatePickupViews(bookingId);

    if (result.error) {
      return { error: mapPickupError(result.error), status: "error" };
    }
    if (!completed.success || completed.data.booking_id !== bookingId) {
      return { error: "indeterminate", status: "error" };
    }
    return { status: "success" };
  } catch {
    revalidatePickupViews(bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

function supportedPhotoSignature(bytes: Buffer, mediaType: string) {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  return false;
}

function validPhoto(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size < 1 || value.size > 5 * 1024 * 1024) {
    return null;
  }
  if (!CONDITION_PHOTO_MEDIA_TYPES.includes(value.type as (typeof CONDITION_PHOTO_MEDIA_TYPES)[number])) {
    return null;
  }
  return value;
}

function bindConditionPhotoIntentId(input: {
  attemptId: string;
  byteSize: number;
  conditionReportId: string;
  mediaType: string;
  sha256: string;
  supersedesPhotoId?: string;
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function storedConditionPhotoMatches(
  objectPath: string,
  expectedBytes: Buffer,
  expectedSha256: string,
) {
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return false;
  }
  const downloaded = await admin.storage
    .from("condition-evidence")
    .download(objectPath);
  if (downloaded.error || !downloaded.data) return false;
  const storedBytes = Buffer.from(await downloaded.data.arrayBuffer());
  return (
    storedBytes.byteLength === expectedBytes.byteLength &&
    createHash("sha256").update(storedBytes).digest("hex") === expectedSha256
  );
}

async function cleanupPhotoIntent(
  context: AdminContext,
  intentId: string,
) {
  const prepared = await context.supabase
    .schema("api")
    .rpc("prepare_condition_photo_upload_cleanup", {
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
    });
  const intent = conditionPhotoIntentSchema.safeParse(prepared.data);
  if (prepared.error || !intent.success) return false;
  if (intent.data.status === "cleaned" || intent.data.status === "expired") {
    return true;
  }
  if (intent.data.status !== "cleanup_pending" || !intent.data.object_path) {
    return false;
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return false;
  }
  const removed = await admin.storage
    .from("condition-evidence")
    .remove([intent.data.object_path]);
  if (removed.error) return false;

  const finalized = await context.supabase
    .schema("api")
    .rpc("finalize_condition_photo_upload_cleanup", {
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
    });
  return !finalized.error;
}

async function saveConditionPhoto(
  context: AdminContext,
  conditionReportId: string,
  intentId: string,
  photo: File,
  supersedesPhotoId?: string,
) {
  const bytes = Buffer.from(await photo.arrayBuffer());
  if (!supportedPhotoSignature(bytes, photo.type)) return "invalid" as const;

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const activeIntentId = bindConditionPhotoIntentId({
    attemptId: intentId,
    byteSize: bytes.byteLength,
    conditionReportId,
    mediaType: photo.type,
    sha256,
    supersedesPhotoId,
  });
  const createIntent = () => {
    const common = {
      p_byte_size: bytes.byteLength,
      p_condition_report_id: conditionReportId,
      p_intent_id: activeIntentId,
      p_media_type: photo.type,
      p_operation_id: randomUUID(),
      p_sha256_hex: sha256,
    };
    return supersedesPhotoId
      ? context.supabase
          .schema("api")
          .rpc("create_condition_photo_replacement_intent", {
            ...common,
            p_supersedes_photo_id: supersedesPhotoId,
          })
      : context.supabase
          .schema("api")
          .rpc("create_condition_photo_upload_intent", common);
  };

  const result = await createIntent();
  const intent = conditionPhotoIntentSchema.safeParse(result.data);
  if (
    !result.error &&
    intent.success &&
    intent.data.status === "cleanup_pending" &&
    intent.data.id
  ) {
    await cleanupPhotoIntent(context, intent.data.id);
    return "unavailable" as const;
  }

  if (result.error || !intent.success) {
    const read = await context.supabase
      .schema("api")
      .rpc("get_condition_photo_upload_intent", { p_intent_id: activeIntentId });
    const current = conditionPhotoIntentSchema.safeParse(read.data);
    if (
      read.error ||
      !current.success ||
      current.data.status !== "finalized" ||
      current.data.id !== activeIntentId ||
      current.data.condition_report_id !== conditionReportId ||
      current.data.media_type !== photo.type ||
      current.data.byte_size !== bytes.byteLength ||
      !current.data.object_path ||
      !(await storedConditionPhotoMatches(current.data.object_path, bytes, sha256))
    ) {
      return "unavailable" as const;
    }
    return "saved" as const;
  }
  if (intent.data.status === "finalized") {
    return intent.data.id === activeIntentId &&
      intent.data.condition_report_id === conditionReportId &&
      intent.data.media_type === photo.type &&
      intent.data.byte_size === bytes.byteLength &&
      intent.data.object_path &&
      (await storedConditionPhotoMatches(intent.data.object_path, bytes, sha256))
      ? "saved" as const
      : "unavailable" as const;
  }
  if (
    intent.data.status !== "awaiting_upload" ||
    !intent.data.id ||
    !intent.data.object_path
  ) {
    return "unavailable" as const;
  }

  const uploaded = await context.supabase.storage
    .from("condition-evidence")
    .upload(intent.data.object_path, bytes, {
      cacheControl: "0",
      contentType: photo.type,
      upsert: false,
    });
  if (uploaded.error) {
    await cleanupPhotoIntent(context, intent.data.id);
    return "unavailable" as const;
  }

  if (!(await storedConditionPhotoMatches(intent.data.object_path, bytes, sha256))) {
    await cleanupPhotoIntent(context, intent.data.id);
    return "unavailable" as const;
  }

  const finalize = () =>
    context.supabase.schema("api").rpc("finalize_condition_photo_upload", {
      p_intent_id: intent.data.id!,
      p_operation_id: randomUUID(),
      p_verified_byte_size: bytes.byteLength,
      p_verified_media_type: photo.type,
      p_verified_sha256_hex: sha256,
    });
  const finalized = await finalize();
  const finalizedData = conditionPhotoFinalizeSchema.safeParse(finalized.data);
  if (
    !finalized.error &&
    finalizedData.success &&
    finalizedData.data.booking_id === intent.data.booking_id &&
    finalizedData.data.condition_report_id === intent.data.condition_report_id &&
    finalizedData.data.photo_id === intent.data.photo_id
  ) {
    return "saved" as const;
  }

  const read = await context.supabase
    .schema("api")
    .rpc("get_condition_photo_upload_intent", { p_intent_id: intent.data.id });
  const current = conditionPhotoIntentSchema.safeParse(read.data);
  if (!read.error && current.success && current.data.status === "finalized") {
    return "saved" as const;
  }

  const retried = await finalize();
  const retriedData = conditionPhotoFinalizeSchema.safeParse(retried.data);
  if (
    !retried.error &&
    retriedData.success &&
    retriedData.data.booking_id === intent.data.booking_id &&
    retriedData.data.condition_report_id === intent.data.condition_report_id &&
    retriedData.data.photo_id === intent.data.photo_id
  ) {
    return "saved" as const;
  }
  await cleanupPhotoIntent(context, intent.data.id);
  return "unavailable" as const;
}

export async function uploadConditionPhoto(
  _state: ConditionPhotoActionState,
  formData: FormData,
): Promise<ConditionPhotoActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const conditionReportId = stringFormValue(formData, "conditionReportId");
  const intentId = stringFormValue(formData, "intentId");
  const supersedesPhotoId = stringFormValue(formData, "supersedesPhotoId");
  const photo = validPhoto(formData.get("photo"));
  if (
    !idSchema.safeParse(bookingId).success ||
    !idSchema.safeParse(conditionReportId).success ||
    !idSchema.safeParse(intentId).success ||
    (supersedesPhotoId !== "" && !idSchema.safeParse(supersedesPhotoId).success)
  ) {
    return { error: "invalid", status: "error" };
  }
  if (!photo) {
    return {
      error: "invalid",
      fieldErrors: { photo: "Choose a non-empty JPEG or PNG no larger than 5 MiB." },
      status: "error",
    };
  }

  let context: AdminContext;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      error: isAdminAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const saved = await saveConditionPhoto(
      context,
      conditionReportId,
      intentId,
      photo,
      supersedesPhotoId || undefined,
    );
    revalidatePickupViews(bookingId);
    if (saved === "invalid") {
      return {
        error: "invalid",
        fieldErrors: { photo: "The file contents must match its JPEG or PNG type." },
        status: "error",
      };
    }
    return saved === "saved"
      ? { result: "saved", status: "success" }
      : { error: "unavailable", status: "error" };
  } catch {
    revalidatePickupViews(bookingId);
    return { error: "indeterminate", status: "error" };
  }
}

function safeSignedUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "::1", "localhost"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

async function signAuthorizedPhoto(
  grant: z.infer<typeof conditionPhotoAccessGrantSchema>,
) {
  const signed = await createSupabaseAdminClient()
    .storage.from("condition-evidence")
    .createSignedUrl(grant.object_path, grant.expires_in_seconds);
  if (signed.error || !signed.data?.signedUrl || !safeSignedUrl(signed.data.signedUrl)) {
    return null;
  }
  return signed.data.signedUrl;
}

export async function requestAdminConditionPhotoAccess(
  _state: ConditionPhotoActionState,
  formData: FormData,
): Promise<ConditionPhotoActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const photoId = stringFormValue(formData, "photoId");
  const purpose = stringFormValue(formData, "purpose") || "pickup_condition_review";
  if (
    !idSchema.safeParse(bookingId).success ||
    !idSchema.safeParse(photoId).success ||
    !["pickup_condition_review", "return_condition_review"].includes(purpose)
  ) {
    return { error: "invalid", status: "error" };
  }

  try {
    const context = await requireAdmin();
    const result = await context.supabase
      .schema("api")
      .rpc("authorize_condition_photo_access", {
        p_operation_id: randomUUID(),
        p_photo_id: photoId,
        p_purpose: purpose,
      });
    const grant = conditionPhotoAccessGrantSchema.safeParse(result.data);
    if (result.error || !grant.success || grant.data.booking_id !== bookingId) {
      return {
        error: result.error ? mapPhotoAccessError(result.error) : "indeterminate",
        status: "error",
      };
    }
    const signedUrl = await signAuthorizedPhoto(grant.data);
    if (!signedUrl) return { error: "unavailable", status: "error" };
    return {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      photoId,
      signedUrl,
      status: "success",
    };
  } catch (error) {
    return {
      error: isAdminAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }
}

export async function requestMyConditionPhotoAccess(
  _state: ConditionPhotoActionState,
  formData: FormData,
): Promise<ConditionPhotoActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const photoId = stringFormValue(formData, "photoId");
  if (!idSchema.safeParse(bookingId).success || !idSchema.safeParse(photoId).success) {
    return { error: "invalid", status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    return { error: "unauthorized", status: "error" };
  }

  try {
    const result = await context.supabase
      .schema("api")
      .rpc("authorize_my_condition_photo_access", {
        p_booking_id: bookingId,
        p_photo_id: photoId,
      });
    const grant = conditionPhotoAccessGrantSchema.safeParse(result.data);
    if (result.error || !grant.success || grant.data.booking_id !== bookingId) {
      return { error: result.error?.code === "P0002" ? "unavailable" : "indeterminate", status: "error" };
    }
    const signedUrl = await signAuthorizedPhoto(grant.data);
    if (!signedUrl) return { error: "unavailable", status: "error" };
    return {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      photoId,
      signedUrl,
      status: "success",
    };
  } catch {
    return { error: "indeterminate", status: "error" };
  }
}
