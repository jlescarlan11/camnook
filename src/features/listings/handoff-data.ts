import "server-only";

import { z } from "zod";

import {
  isAdminAuthorizationError,
  type requirePageAdmin,
} from "@/lib/auth/require-admin";

import {
  MANILA_TIMEZONE,
  type AdminCameraHandoffSummary,
  type AdminHandoffPolicy,
} from "./handoff-types";

type AdminContext = Awaited<ReturnType<typeof requirePageAdmin>>;

const adminPolicySchema = z.object({
  allowed_weekdays: z.array(z.number().int().min(0).max(6)),
  approved_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)),
  camera_id: z.uuid(),
  camera_name: z.string().min(1),
  camera_status: z.enum(["archived", "draft", "published"]),
  city_label: z.string().nullable(),
  country_code: z.literal("PH").nullable(),
  enabled: z.boolean(),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  provider_city_id: z.string().nullable(),
  timezone: z.literal(MANILA_TIMEZONE),
  version: z.coerce.number().int().nonnegative(),
});

export const adminCameraHandoffSummarySchema = z.object({
  camera_id: z.uuid(),
  camera_name: z.string().min(1),
  camera_status: z.enum(["draft", "published"]),
  city_label: z.string().nullable(),
  enabled: z.boolean(),
  version: z.coerce.number().int().nonnegative(),
});

export function projectAdminCameraHandoffSummary(
  camera: z.infer<typeof adminCameraHandoffSummarySchema>,
) {
  return {
    cameraId: camera.camera_id,
    cameraName: camera.camera_name,
    cameraStatus: camera.camera_status,
    cityLabel: camera.city_label,
    enabled: camera.enabled,
    version: camera.version,
  } satisfies AdminCameraHandoffSummary;
}

export async function loadAdminCameraHandoffPolicy(
  context: AdminContext,
  cameraId: string,
): Promise<
  | { policy: AdminHandoffPolicy; status: "success" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "missing" }
> {
  if (!z.uuid().safeParse(cameraId).success) return { status: "missing" };

  const { data, error } = await context.supabase
    .schema("api")
    .rpc("get_camera_handoff_policy_admin", { p_camera_id: cameraId });

  if (isAdminAuthorizationError(error)) return { status: "forbidden" };
  if (error?.code === "P0002") return { status: "missing" };
  if (error) return { status: "error" };

  const parsed = adminPolicySchema.safeParse(data);
  if (!parsed.success) return { status: "error" };

  return {
    policy: {
      allowedWeekdays: parsed.data.allowed_weekdays,
      approvedTimes: parsed.data.approved_times,
      cameraId: parsed.data.camera_id,
      cameraName: parsed.data.camera_name,
      cameraStatus: parsed.data.camera_status,
      cityLabel: parsed.data.city_label ?? "",
      enabled: parsed.data.enabled,
      timezone: parsed.data.timezone,
      version: parsed.data.version,
    },
    status: "success",
  };
}
