"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { getMeetupProviderConfig } from "@/features/meetups/config";
import { GeoapifyAdapter } from "@/features/meetups/provider";
import { claimGeoapifyProviderBudget } from "@/features/meetups/provider-budget";

import { psgcAreaTypeSchema } from "./types";

export type MeetupOriginActionState = {
  error?: "invalid" | "provider" | "save" | "unauthorized";
  status: "error" | "idle" | "success";
};

const resolvedSchema = z.object({
  active: z.boolean(),
  code: z.string().regex(/^\d{10}$/),
  current: z.boolean(),
  name: z.string().min(1).max(160),
  path: z.array(z.object({
    code: z.string().regex(/^\d{10}$/),
    name: z.string().min(1).max(160),
    type: psgcAreaTypeSchema,
  })),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  type: psgcAreaTypeSchema,
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function saveMeetupOrigin(
  _previous: MeetupOriginActionState,
  formData: FormData,
): Promise<MeetupOriginActionState> {
  const input = z.object({
    areaCode: z.string().regex(/^\d{10}$/),
    release: z.string().regex(/^\d{4}-q[1-4]$/),
  }).safeParse({ areaCode: value(formData, "psgcAreaCode"), release: value(formData, "psgcRelease") });
  if (!input.success) return { error: "invalid", status: "error" };

  let context: Awaited<ReturnType<typeof requireUser>>;
  try { context = await requireUser(); } catch { return { error: "unauthorized", status: "error" }; }

  const resolution = await context.supabase.schema("api").rpc("resolve_psgc_area", {
    p_area_code: input.data.areaCode,
    p_release_key: input.data.release,
  });
  const parsed = resolvedSchema.safeParse(resolution.data);
  if (resolution.error || !parsed.success || !parsed.data.active || !parsed.data.current || parsed.data.type !== "barangay") {
    return { error: "invalid", status: "error" };
  }

  const config = getMeetupProviderConfig();
  if (!config || !(await claimGeoapifyProviderBudget(context.user.id, 1))) {
    return { error: "provider", status: "error" };
  }
  let centroid;
  try {
    centroid = await new GeoapifyAdapter({ apiKey: config.apiKey, timeoutMs: config.timeoutMs })
      .geocodeAreaCentroid({
        expectedAreaNames: parsed.data.path
          .filter((area) => area.type !== "region")
          .map((area) => area.name),
        query: `${parsed.data.path.map((area) => area.name).join(", ")}, Philippines`,
      });
  } catch {
    return { error: "provider", status: "error" };
  }

  const saved = await context.supabase.schema("api").rpc("replace_my_meetup_origin_v2", {
    p_input: {
      accuracy_meters: null,
      area_code: parsed.data.code,
      captured_at: new Date().toISOString(),
      consent_version: null,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      precision: "barangay_centroid",
      provenance_version: "renter-default-origin-v1",
      provider_reference: centroid.providerReference,
      release_key: parsed.data.release,
      source: "provider_centroid",
    },
  });
  if (saved.error) return { error: saved.error.code === "42501" ? "unauthorized" : "save", status: "error" };
  revalidatePath("/account");
  return { status: "success" };
}

export async function removeMeetupOrigin(
  previous: MeetupOriginActionState,
  formData: FormData,
): Promise<MeetupOriginActionState> {
  void previous;
  void formData;
  let context: Awaited<ReturnType<typeof requireUser>>;
  try { context = await requireUser(); } catch { return { error: "unauthorized", status: "error" }; }
  const result = await context.supabase.schema("api").rpc("remove_my_meetup_origin");
  if (result.error) return { error: result.error.code === "42501" ? "unauthorized" : "save", status: "error" };
  revalidatePath("/account");
  return { status: "success" };
}
