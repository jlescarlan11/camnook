"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";

export type CameraActionState = { error?: string; status: "idle" | "error" | "success" };

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function cameraInput(formData: FormData) {
  const accessories = text(formData, "included").split(/\n|,/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name, quantity: 1 }));
  return z.object({
    description: z.string().min(2).max(2000),
    dailyRate: z.coerce.number().nonnegative(),
    deposit: z.coerce.number().nonnegative(),
    name: z.string().min(2).max(160),
  }).safeParse({
    description: text(formData, "description"),
    dailyRate: text(formData, "dailyRate"),
    deposit: text(formData, "deposit"),
    name: text(formData, "name"),
  }).success ? {
    accessories,
    description: text(formData, "description"),
    daily_rate: Number(text(formData, "dailyRate")),
    security_deposit: Number(text(formData, "deposit")),
    name: text(formData, "name"),
  } : null;
}

export async function createCameraDraft(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const input = cameraInput(formData);
  if (!input) return { error: "Check the camera name, description, price, and deposit.", status: "error" };
  const context = await requireAdmin();
  const result = await context.supabase.schema("api").rpc("save_camera_draft", { p_input: input });
  if (result.error || typeof result.data !== "string") return { error: "The camera draft could not be created.", status: "error" };
  revalidatePath("/admin/cameras");
  redirect(`/admin/cameras/${result.data}?step=availability`);
}

export async function updateCameraDraft(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const input = cameraInput(formData);
  const id = z.uuid().safeParse(text(formData, "cameraId"));
  if (!input || !id.success) return { error: "Check the camera details.", status: "error" };
  const context = await requireAdmin();
  const result = await context.supabase.schema("api").rpc("save_camera_draft", { p_input: { ...input, id: id.data } });
  if (result.error) return { error: "The camera details could not be saved.", status: "error" };
  revalidatePath("/admin/cameras");
  revalidatePath(`/admin/cameras/${id.data}`);
  return { status: "success" };
}

function inspectImage(bytes: Buffer, type: string) {
  const supported = ["image/jpeg", "image/png", "image/webp"];
  return bytes.length > 0 && bytes.length <= 10 * 1024 * 1024 && supported.includes(type)
    ? { byteSize: bytes.length, mediaType: type, sha256: createHash("sha256").update(bytes).digest("hex") }
    : null;
}

async function abortPhotoUpload(
  context: Awaited<ReturnType<typeof requireAdmin>>,
  publicationId: string,
  stagingPath: string,
  publicPath: string,
) {
  await context.supabase.schema("api").rpc("prepare_catalog_photo_abort", {
    p_operation_id: randomUUID(),
    p_publication_id: publicationId,
  });
  await context.supabase.storage.from("draft-staging").remove([stagingPath]);
  await context.supabase.storage.from("camera-listings").remove([publicPath]);
  await context.supabase.schema("api").rpc("finalize_catalog_photo_abort", {
    p_operation_id: randomUUID(),
    p_publication_id: publicationId,
  });
}

export async function uploadCameraPhoto(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  const photo = formData.get("photo");
  if (!cameraId.success || !(photo instanceof File)) return { error: "Choose a JPEG, PNG, or WebP photo.", status: "error" };
  const bytes = Buffer.from(await photo.arrayBuffer());
  const inspected = inspectImage(bytes, photo.type);
  if (!inspected) return { error: "Choose a JPEG, PNG, or WebP photo up to 10 MB.", status: "error" };
  const context = await requireAdmin();
  const publicationId = randomUUID();
  const intent = await context.supabase.schema("api").rpc("create_catalog_photo_publication", {
    p_alt_text: `${text(formData, "cameraName")} camera`,
    p_byte_size: inspected.byteSize,
    p_camera_id: cameraId.data,
    p_media_type: inspected.mediaType,
    p_operation_id: randomUUID(),
    p_publication_id: publicationId,
    p_sha256_hex: inspected.sha256,
    p_sort_position: Number(text(formData, "sortPosition") || "0"),
  });
  const value = intent.data as { staging_object_path?: string; public_object_path?: string } | null;
  if (intent.error || !value?.staging_object_path || !value.public_object_path) return { error: "The photo upload could not be started.", status: "error" };
  const staging = context.supabase.storage.from("draft-staging");
  const uploaded = await staging.upload(value.staging_object_path, bytes, { cacheControl: "0", contentType: inspected.mediaType, upsert: false });
  if (uploaded.error) {
    await abortPhotoUpload(context, publicationId, value.staging_object_path, value.public_object_path);
    return { error: "The photo could not be uploaded.", status: "error" };
  }
  const ready = await context.supabase.schema("api").rpc("mark_catalog_photo_ready", {
    p_operation_id: randomUUID(), p_publication_id: publicationId,
    p_verified_byte_size: inspected.byteSize, p_verified_media_type: inspected.mediaType, p_verified_sha256_hex: inspected.sha256,
  });
  if (ready.error) {
    await abortPhotoUpload(context, publicationId, value.staging_object_path, value.public_object_path);
    return { error: "The uploaded photo could not be verified.", status: "error" };
  }
  const copied = await staging.copy(value.staging_object_path, value.public_object_path, { destinationBucket: "camera-listings" });
  if (copied.error) {
    await abortPhotoUpload(context, publicationId, value.staging_object_path, value.public_object_path);
    return { error: "The verified photo could not be published.", status: "error" };
  }
  const finalized = await context.supabase.schema("api").rpc("finalize_catalog_photo_publication", {
    p_operation_id: randomUUID(), p_publication_id: publicationId,
    p_verified_byte_size: inspected.byteSize, p_verified_media_type: inspected.mediaType, p_verified_sha256_hex: inspected.sha256,
  });
  if (finalized.error) {
    await abortPhotoUpload(context, publicationId, value.staging_object_path, value.public_object_path);
    return { error: "The photo publication could not be confirmed.", status: "error" };
  }
  await staging.remove([value.staging_object_path]);
  await context.supabase.schema("api").rpc("confirm_catalog_photo_staging_removed", { p_operation_id: randomUUID(), p_publication_id: publicationId });
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  revalidatePath("/admin/cameras");
  return { status: "success" };
}

export async function publishCamera(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  if (!cameraId.success) return { error: "Camera not found.", status: "error" };
  const context = await requireAdmin();
  const result = await context.supabase.schema("api").rpc("publish_camera", { p_camera_id: cameraId.data, p_operation_id: randomUUID() });
  if (result.error) return { error: "Complete every readiness item before publishing.", status: "error" };
  revalidatePath("/");
  revalidatePath("/admin/cameras");
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  return { status: "success" };
}

export async function unpublishCamera(formData: FormData) {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  if (!cameraId.success) return;
  const context = await requireAdmin();
  await context.supabase.schema("api").rpc("unpublish_camera", { p_camera_id: cameraId.data });
  revalidatePath("/");
  revalidatePath("/admin/cameras");
}

export async function blockCameraDates(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  const dates = z.object({ end: z.iso.date(), start: z.iso.date() }).safeParse({ end: text(formData, "endDate"), start: text(formData, "startDate") });
  if (!cameraId.success || !dates.success || dates.data.end < dates.data.start) return { error: "Choose a valid blocked date range.", status: "error" };
  const end = new Date(`${dates.data.end}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  const context = await requireAdmin();
  const result = await context.supabase.schema("api").rpc("create_manual_block", {
    p_camera_id: cameraId.data,
    p_ends_at: end.toISOString(),
    p_kind: "manual",
    p_reason: "Owner blocked dates",
    p_starts_at: `${dates.data.start}T00:00:00+08:00`,
  });
  if (result.error) return { error: "Those dates overlap another unavailable period.", status: "error" };
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  return { status: "success" };
}
