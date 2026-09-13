import { parseCameraAccessories } from "../../src/features/listings/camera-accessories";
import type { CameraActionState } from "../../src/features/listings/owner-actions";

export async function updateCameraDraft(_state: CameraActionState, data: FormData): Promise<CameraActionState> {
  const accessories = parseCameraAccessories(String(data.get("included") ?? ""));
  window.dispatchEvent(new CustomEvent("usability-camera", { detail: { dailyRate: data.get("dailyRate"), accessories } }));
  // Vite fixture models the server redirect; Next.js routing is not running here.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (accessories && data.get("intent") === "continue") window.location.assign("/handoff-recovery");
  return accessories ? { status: "success" } : { status: "error", error: "Invalid included items." };
}
export const createCameraDraft = updateCameraDraft;
export async function blockCameraDates(_state: CameraActionState, data: FormData): Promise<CameraActionState> {
  if (String(data.get("endDate")) < String(data.get("startDate"))) return { status: "error", error: "Choose a valid blocked date range." };
  const end = new Date(`${data.get("endDate")}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  window.dispatchEvent(new CustomEvent("usability-block-created", { detail: { id: crypto.randomUUID(), kind: "manual", starts_at: `${data.get("startDate")}T00:00:00+08:00`, ends_at: end.toISOString() } }));
  return { status: "success" };
}
let blockRemovalAttempts = 0;
export async function removeCameraBlock(_state: CameraActionState, data: FormData): Promise<CameraActionState> {
  blockRemovalAttempts += 1;
  if (blockRemovalAttempts === 1) return { status: "error", error: "The block could not be removed. Please retry or reload the current blocked dates." };
  window.dispatchEvent(new CustomEvent("usability-block-released", { detail: String(data.get("blockId")) }));
  return { status: "success" };
}
export const publishCamera = updateCameraDraft;
let photoAttempts = 0;
export async function uploadCameraPhoto(_state: CameraActionState, data: FormData): Promise<CameraActionState> {
  const photo = data.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { status: "error", error: "Choose a photo." };
  photoAttempts += 1;
  return photoAttempts === 1 ? { status: "error", error: "The photo could not be uploaded." } : { status: "success" };
}

let unpublishAttempts = 0;
export async function unpublishCamera(): Promise<CameraActionState> {
  unpublishAttempts += 1;
  return unpublishAttempts === 1 ? { status: "error", error: "The camera could not be unpublished. Please try again." } : { status: "success" };
}
