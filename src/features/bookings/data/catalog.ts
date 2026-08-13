import "server-only";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicCamera = {
  accessories: { name: string; quantity: number }[];
  availability: { endsAt: string; reason: string; startsAt: string }[];
  dailyRate: number;
  description: string;
  id: string;
  name: string;
  photos: { alt: string; url: string }[];
  securityDeposit: number;
  slug: string;
};

export type CatalogResult =
  | { cameras: PublicCamera[]; status: "success" }
  | { status: "error" };

type PublicCameraRow = {
  daily_rate: number | null;
  description: string | null;
  id: string | null;
  name: string | null;
  security_deposit: number | null;
  slug: string | null;
};

type PhotoRow = {
  alt_text: string | null;
  camera_id: string | null;
  object_path: string | null;
};

type AccessoryRow = {
  camera_id: string;
  name: string;
  quantity: number;
};

type AvailabilityRow = {
  camera_id: string | null;
  ends_at: string | null;
  reason: string | null;
  starts_at: string | null;
};

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
  const [camerasResult, photosResult, accessoriesResult, availabilityResult] =
    await Promise.all([
      supabase
        .from("public_cameras")
        .select(
          "id,slug,name,description,daily_rate,security_deposit,published_at",
        )
        .order("published_at", { ascending: false }),
      supabase
        .from("public_camera_photos")
        .select("id,camera_id,object_path,alt_text,sort_position")
        .order("sort_position"),
      supabase
        .from("camera_accessories")
        .select("camera_id,name,quantity,sort_position")
        .is("archived_at", null)
        .order("sort_position"),
      supabase
        .from("public_availability")
        .select("camera_id,starts_at,ends_at,reason")
        .order("starts_at"),
    ]);

  if (
    camerasResult.error ||
    photosResult.error ||
    accessoriesResult.error ||
    availabilityResult.error
  ) {
    return { status: "error" };
  }

  const photos = (photosResult.data ?? []) as PhotoRow[];
  const accessories = (accessoriesResult.data ?? []) as AccessoryRow[];
  const availability = (availabilityResult.data ?? []) as AvailabilityRow[];
  const cameras = ((camerasResult.data ?? []) as PublicCameraRow[]).flatMap(
    (camera): PublicCamera[] => {
      if (
        !camera.id ||
        !camera.slug ||
        !camera.name ||
        !camera.description ||
        camera.daily_rate === null ||
        camera.security_deposit === null
      ) {
        return [];
      }
      const cameraName = camera.name;

      return [
        {
          accessories: accessories
            .filter((item) => item.camera_id === camera.id)
            .map((item) => ({ name: item.name, quantity: item.quantity })),
          availability: availability.flatMap((period) =>
            period.camera_id === camera.id &&
            period.starts_at &&
            period.ends_at &&
            period.reason
              ? [
                  {
                    endsAt: period.ends_at,
                    reason: period.reason,
                    startsAt: period.starts_at,
                  },
                ]
              : [],
          ),
          dailyRate: camera.daily_rate,
          description: camera.description,
          id: camera.id,
          name: cameraName,
          photos: photos.flatMap((photo) => {
            if (
              photo.camera_id !== camera.id ||
              !photo.object_path
            ) {
              return [];
            }
            const photoUrl = buildPublicCameraPhotoUrl(url, photo.object_path);
            const alt = photo.alt_text?.trim() || cameraName;
            return photoUrl ? [{ alt, url: photoUrl }] : [];
          }),
          securityDeposit: camera.security_deposit,
          slug: camera.slug,
        },
      ];
    },
  );

  return { cameras, status: "success" };
}

export async function loadPublicCamera(slug: string) {
  const result = await loadCatalog();
  if (result.status === "error") return result;
  const camera = result.cameras.find((item) => item.slug === slug);
  return camera
    ? ({ camera, status: "success" } as const)
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
