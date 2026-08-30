import "server-only";

import { z } from "zod";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";

export type PublicCamera = {
  accessories: { name: string; quantity: number }[];
  availability: { endsAt: string; reason: string; startsAt: string }[];
  dailyRate: number;
  description: string;
  id: string;
  handoffPolicy: PublicHandoffPolicy | null;
  name: string;
  photos: { alt: string; url: string }[];
  securityDeposit: number;
  slug: string;
};

export type CatalogResult =
  | { cameras: PublicCamera[]; status: "success" }
  | { status: "error" };

const publicCameraSnapshotSchema = z.object({
  accessories: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().positive(),
  }).strict()),
  availability: z.array(z.object({
    ends_at: z.string().min(1),
    reason: z.enum(["booked", "unavailable"]),
    starts_at: z.string().min(1),
  }).strict()),
  daily_rate: z.number().nonnegative(),
  description: z.string().min(1),
  handoff_policy: z.object({
    allowed_weekdays: z.array(z.number().int().min(0).max(6)),
    approved_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)),
    city_label: z.string().nullable(),
    enabled: z.boolean(),
    timezone: z.string(),
    version: z.number().int().nonnegative(),
  }).strict().nullable(),
  id: z.uuid(),
  name: z.string().min(1),
  photos: z.array(z.object({
    alt_text: z.string().nullable(),
    object_path: z.string().min(1),
  }).strict()),
  published_at: z.string().min(1),
  security_deposit: z.number().nonnegative(),
  slug: z.string().min(1),
}).strict();
const publicCatalogSnapshotSchema = z.array(publicCameraSnapshotSchema);
const publicCameraSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function buildPublicCameraPhotoUrl(
  configuredUrl: string,
  objectPath: string,
) {
  if (!objectPath || objectPath.startsWith("/") || objectPath.includes("\\")) {
    return null;
  }

  const segments = objectPath.split("/");
  if (
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment),
    )
  ) {
    return null;
  }

  try {
    const base = new URL(configuredUrl);
    if (base.protocol !== "https:" && base.hostname !== "127.0.0.1") {
      return null;
    }
    const encodedPath = segments.map(encodeURIComponent).join("/");
    return `${base.origin}/storage/v1/object/public/camera-listings/${encodedPath}`;
  } catch {
    return null;
  }
}

export async function loadCatalog(): Promise<CatalogResult> {
  const supabase = await createSupabaseServerClient();
  const { url } = getSupabasePublicConfig();
  const result = await supabase
    .schema("api")
    .rpc("get_public_catalog_snapshot");
  const parsed = publicCatalogSnapshotSchema.safeParse(result.data);
  if (result.error || !parsed.success) return { status: "error" };

  const cameras = parsed.data.map((camera) => projectPublicCamera(camera, url));

  return { cameras, status: "success" };
}

function projectPublicCamera(
  camera: z.infer<typeof publicCameraSnapshotSchema>,
  configuredUrl: string,
): PublicCamera {
  const cameraName = camera.name;
  const handoffPolicy = camera.handoff_policy;

  return {
    accessories: camera.accessories,
    availability: camera.availability.map((period) => ({
      endsAt: period.ends_at,
      reason: period.reason,
      startsAt: period.starts_at,
    })),
    dailyRate: camera.daily_rate,
    description: camera.description,
    id: camera.id,
    handoffPolicy:
      handoffPolicy?.city_label && handoffPolicy.timezone === "Asia/Manila"
        ? {
            allowedWeekdays: handoffPolicy.allowed_weekdays,
            approvedTimes: handoffPolicy.approved_times,
            cityLabel: handoffPolicy.city_label,
            enabled: handoffPolicy.enabled,
            timezone: "Asia/Manila",
            version: handoffPolicy.version,
          }
        : null,
    name: cameraName,
    photos: camera.photos.flatMap((photo) => {
      const photoUrl = buildPublicCameraPhotoUrl(configuredUrl, photo.object_path);
      const alt = photo.alt_text?.trim() || cameraName;
      return photoUrl ? [{ alt, url: photoUrl }] : [];
    }),
    securityDeposit: camera.security_deposit,
    slug: camera.slug,
  };
}

export async function loadPublicCamera(slug: string) {
  const parsedSlug = publicCameraSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { status: "missing" } as const;

  const supabase = await createSupabaseServerClient();
  const { url } = getSupabasePublicConfig();
  const result = await supabase.schema("api").rpc(
    "get_public_camera_snapshot",
    { p_slug: parsedSlug.data },
  );
  const parsed = publicCameraSnapshotSchema.nullable().safeParse(result.data);
  if (result.error || !parsed.success) return { status: "error" } as const;
  return parsed.data
    ? ({ camera: projectPublicCamera(parsed.data, url), status: "success" } as const)
    : ({ status: "missing" } as const);
}

export function publicCatalogPresentation(result: CatalogResult) {
  if (result.status === "error") {
    return {
      kind: "error" as const,
      message: "We couldn’t load the camera catalog. Please try again.",
      showRequestControl: false,
    };
  }
  if (result.cameras.length === 0) {
    return {
      kind: "empty" as const,
      message: "No cameras are published right now. Please check back later.",
      showRequestControl: false,
    };
  }
  return {
    cameras: result.cameras,
    kind: "ready" as const,
    showRequestControl: true,
  };
}
