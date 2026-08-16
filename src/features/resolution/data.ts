import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";
import type { requireUser } from "@/lib/auth/require-user";

import {
  myResolutionStateSchema,
  resolutionDetailSchema,
  resolutionQueuesSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;
type UserContext = Awaited<ReturnType<typeof requireUser>>;

export async function loadResolutionQueues(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_resolution_queues");
  const parsed = resolutionQueuesSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { queues: parsed.data, status: "success" } as const;
}

export async function loadResolutionDetail(
  context: AdminContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_resolution_detail", { p_booking_id: bookingId });
  const parsed = resolutionDetailSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;
  return { resolution: parsed.data, status: "success" } as const;
}

export async function loadMyResolutionState(
  context: UserContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_my_resolution_state", { p_booking_id: bookingId });
  const parsed = myResolutionStateSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;
  return { resolution: parsed.data, status: "success" } as const;
}
