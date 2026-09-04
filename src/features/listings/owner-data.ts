import "server-only";

import { z } from "zod";
import type { requirePageAdmin } from "@/lib/auth/require-admin";

type AdminContext = Awaited<ReturnType<typeof requirePageAdmin>>;

const cameraSchema = z.object({
  accessories: z.array(z.object({ name: z.string(), quantity: z.number().int().positive() })),
  daily_rate: z.number().nonnegative(),
  description: z.string().nullable(),
  handoff: z.object({
    allowed_weekdays: z.array(z.number().int()),
    approved_times: z.array(z.string()),
    enabled: z.boolean(),
    pickup_area: z.string().nullable(),
    version: z.number().int(),
  }).nullable(),
  id: z.uuid(),
  name: z.string(),
  photo_count: z.number().int().nonnegative(),
  published_at: z.string().nullable(),
  security_deposit: z.number().nonnegative(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  upcoming_rentals: z.number().int().nonnegative(),
}).strict();

export type OwnerCamera = z.infer<typeof cameraSchema>;

export async function loadOwnerCameras(context: AdminContext) {
  const result = await context.supabase.schema("api").rpc("get_owner_cameras");
  const parsed = z.array(cameraSchema).safeParse(result.data);
  return result.error || !parsed.success
    ? { status: "error" as const }
    : { cameras: parsed.data, status: "success" as const };
}

export async function loadOwnerCamera(context: AdminContext, cameraId: string) {
  if (!z.uuid().safeParse(cameraId).success) return { status: "missing" as const };
  const result = await loadOwnerCameras(context);
  if (result.status === "error") return result;
  const camera = result.cameras.find((item) => item.id === cameraId);
  return camera ? { camera, status: "success" as const } : { status: "missing" as const };
}
