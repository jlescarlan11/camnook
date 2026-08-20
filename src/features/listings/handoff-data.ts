import "server-only";

import { z } from "zod";

import type { requirePageAdmin } from "@/lib/auth/require-admin";

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

export async function loadAdminCameraHandoffPolicy(
  context: AdminContext,
  cameraId: string,
): Promise<
  | { policy: AdminHandoffPolicy; status: "success" }
  | { status: "error" }
  | { status: "missing" }
> {
  if (!z.uuid().safeParse(cameraId).success) return { status: "missing" };

  const { data, error } = await context.supabase
    .schema("api")
    .rpc("get_camera_handoff_policy_admin", { p_camera_id: cameraId });

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
      countryCode: parsed.data.country_code ?? "PH",
      enabled: parsed.data.enabled,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      providerCityId: parsed.data.provider_city_id ?? "",
      timezone: parsed.data.timezone,
      version: parsed.data.version,
    },
    status: "success",
  };
}

export async function loadAdminCameraHandoffSummaries(
  context: AdminContext,
): Promise<
  | { cameras: AdminCameraHandoffSummary[]; status: "success" }
  | { status: "error" }
> {
  const [camerasResult, policiesResult] = await Promise.all([
    context.supabase
      .from("cameras")
      .select("id,name,status")
      .neq("status", "archived")
      .order("name"),
    context.supabase
      .from("camera_handoff_policies")
      .select("camera_id,city_label,enabled,version"),
  ]);

  if (camerasResult.error || policiesResult.error) return { status: "error" };

  const policies = new Map(
    (policiesResult.data ?? []).map((policy) => [policy.camera_id, policy]),
  );
  const cameras = (camerasResult.data ?? []).map((camera) => {
    const policy = policies.get(camera.id);
    return {
      cameraId: camera.id,
      cameraName: camera.name,
      cameraStatus: camera.status,
      cityLabel: policy?.city_label ?? null,
      enabled: policy?.enabled ?? false,
      version: policy?.version ?? 0,
    } satisfies AdminCameraHandoffSummary;
  });

  return { cameras, status: "success" };
}
