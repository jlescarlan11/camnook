import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";
import type { requireUser } from "@/lib/auth/require-user";

import {
  activeRentalQueueSchema,
  myPickupStateSchema,
  pickupDetailSchema,
  pickupQueueSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;
type UserContext = Awaited<ReturnType<typeof requireUser>>;

export async function loadPickupQueue(context: AdminContext) {
  const result = await context.supabase.schema("api").rpc("get_pickup_queue");
  const parsed = pickupQueueSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { items: parsed.data, status: "success" } as const;
}

export async function loadActiveRentalQueue(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_active_rental_queue");
  const parsed = activeRentalQueueSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { items: parsed.data, status: "success" } as const;
}

export async function loadPickupDetail(
  context: AdminContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_pickup_detail", { p_booking_id: bookingId });
  const parsed = pickupDetailSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;
  return { pickup: parsed.data, status: "success" } as const;
}

export async function loadMyPickupState(
  context: UserContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_my_pickup_state", { p_booking_id: bookingId });
  const parsed = myPickupStateSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;
  return { pickup: parsed.data, status: "success" } as const;
}
