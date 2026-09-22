"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { parseCameraAccessories } from "./camera-accessories";
import { createAndPublishCatalogPhoto, inspectImageBytes } from "../../../scripts/catalog-photo-publication-lib.mjs";

export type CameraActionState = { error?: string; status: "idle" | "error" | "success" };

async function authorizeCameraAction() {
  try {
    return { context: await requireAdmin(), error: null } as const;
  } catch {
    return {
      context: null,
      error: {
        error: "Administrator authorization could not be verified. Reload before retrying.",
        status: "error",
      },
    } as const;
  }
}


function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function cameraInput(formData: FormData) {
  const accessories = parseCameraAccessories(text(formData, "included"));
  if (!accessories) return null;
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
  if (!input) return { error: "Check the camera name, description, price, deposit, and included items. Use a positive whole-number quantity and list each item only once.", status: "error" };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("save_camera_draft", { p_input: input });
  if (result.error || typeof result.data !== "string") return { error: "The camera draft could not be created.", status: "error" };
  revalidatePath("/admin/cameras");
  redirect(`/admin/cameras/${result.data}?step=availability`);
}

export async function updateCameraDraft(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const input = cameraInput(formData);
  const id = z.uuid().safeParse(text(formData, "cameraId"));
  if (!input || !id.success) return { error: "Check the camera details and included items. Use a positive whole-number quantity and list each item only once.", status: "error" };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("save_camera_draft", { p_input: { ...input, id: id.data } });
  if (result.error) return { error: "The camera details could not be saved.", status: "error" };
  revalidatePath("/admin/cameras");
  revalidatePath(`/admin/cameras/${id.data}`);
  if (text(formData, "intent") === "continue") redirect(`/admin/cameras/${id.data}?step=availability`);
  return { status: "success" };
}

function inspectImage(bytes: Buffer, type: string) {
  try {
    const inspected = inspectImageBytes(bytes);
    return inspected.mediaType === type
      ? { byteSize: inspected.byteSize, mediaType: inspected.mediaType, sha256: inspected.sha256Hex }
      : null;
  } catch {
    return null;
  }
}

export async function uploadCameraPhoto(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  const publicationId = z.uuid().safeParse(text(formData, "publicationId"));
  const photo = formData.get("photo");
  if (!cameraId.success || !(photo instanceof File)) return { error: "Choose a JPEG, PNG, or WebP photo.", status: "error" };
  const bytes = Buffer.from(await photo.arrayBuffer());
  const inspected = inspectImage(bytes, photo.type);
  if (!inspected) return { error: "Choose a JPEG, PNG, or WebP photo up to 10 MB.", status: "error" };
  if (!publicationId.success) return { error: "Reload the photo form before uploading.", status: "error" };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  try {
    await createAndPublishCatalogPhoto({
      altText: `${text(formData, "cameraName")} camera`,
      beforeMutation: undefined,
      bytes,
      cameraId: cameraId.data,
      client: context.supabase,
      publicationId: publicationId.data,
      sortPosition: Number(text(formData, "sortPosition") || "0"),
    });
  } catch {
    revalidatePath(`/admin/cameras/${cameraId.data}`);
    return { error: "The photo publication could not be confirmed. Retry the unchanged photo or reload to check the saved photos.", status: "error" };
  }
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  revalidatePath("/admin/cameras");
  return { status: "success" };
}

export async function publishCamera(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  if (!cameraId.success) return { error: "Camera not found.", status: "error" };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("publish_camera", { p_camera_id: cameraId.data, p_operation_id: randomUUID() });
  if (result.error) return { error: "Complete every readiness item before publishing.", status: "error" };
  revalidatePath("/");
  revalidatePath("/admin/cameras");
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  return { status: "success" };
}

export async function unpublishCamera(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  if (!cameraId.success) return { status: "error", error: "Camera not found." };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("unpublish_camera", { p_camera_id: cameraId.data });
  if (result.error) return { status: "error", error: "The camera could not be unpublished. Please try again." };
  revalidatePath("/");
  revalidatePath("/admin/cameras");
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  return { status: "success" };
}

export async function blockCameraDates(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const cameraId = z.uuid().safeParse(text(formData, "cameraId"));
  const dates = z.object({ end: z.iso.date(), start: z.iso.date() }).safeParse({ end: text(formData, "endDate"), start: text(formData, "startDate") });
  if (!cameraId.success || !dates.success || dates.data.end < dates.data.start) return { error: "Choose a valid blocked date range.", status: "error" };
  const end = new Date(`${dates.data.end}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("create_manual_block", {
    p_camera_id: cameraId.data,
    p_ends_at: end.toISOString(),
    p_kind: "manual",
    p_reason: "Owner blocked dates",
    p_starts_at: `${dates.data.start}T00:00:00+08:00`,
  });
  if (result.error) {
    const error = result.error.code === "23P01"
      ? "Those dates overlap another unavailable period."
      : result.error.code === "42501"
        ? "Administrator authorization is required to block dates."
        : "The blocked dates could not be confirmed. Reload availability before retrying.";
    return { error, status: "error" };
  }
  revalidatePath(`/admin/cameras/${cameraId.data}`);
  return { status: "success" };
}

export async function removeCameraBlock(_state: CameraActionState, formData: FormData): Promise<CameraActionState> {
  const input = z.object({ blockId: z.uuid(), cameraId: z.uuid() }).safeParse({ blockId: text(formData, "blockId"), cameraId: text(formData, "cameraId") });
  if (!input.success) return { status: "error", error: "This blocked range could not be identified. Reload and try again." };
  const authorization = await authorizeCameraAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const result = await context.supabase.schema("api").rpc("release_manual_block", { p_block_id: input.data.blockId });
  if (result.error) return { status: "error", error: "The block could not be removed. Please retry or reload the current blocked dates." };
  revalidatePath(`/admin/cameras/${input.data.cameraId}`);
  revalidatePath("/");
  return { status: "success" };
}
