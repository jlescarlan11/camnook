import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";
import type { requireUser } from "@/lib/auth/require-user";

import {
  gcashRecipientConfigurationSchema,
  paymentAccountingSummarySchema,
  paymentAuditHistorySchema,
  paymentReviewDetailSchema,
  paymentReviewQueueSchema,
  paymentStateSchema,
} from "./types";

type UserContext = Awaited<ReturnType<typeof requireUser>>;
type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

const paymentReviewContextSchema = z.object({
  audit: paymentAuditHistorySchema,
  detail: paymentReviewDetailSchema,
}).strict();

export async function loadGcashRecipientConfiguration(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_gcash_recipient_configuration_admin");
  const parsed = gcashRecipientConfigurationSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { configuration: parsed.data, status: "success" } as const;
}

export async function loadMyPaymentState(
  context: UserContext,
  bookingId: string,
) {
  if (!z.uuid().safeParse(bookingId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_my_payment_state", { p_booking_id: bookingId });
  const parsed = paymentStateSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;

  return { payment: parsed.data, status: "success" } as const;
}

export async function loadPaymentReviewQueue(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_payment_review_queue");
  const parsed = paymentReviewQueueSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { items: parsed.data, status: "success" } as const;
}

export async function loadPaymentAccountingSummary(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_payment_accounting_summary");
  const parsed = paymentAccountingSummarySchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { summary: parsed.data, status: "success" } as const;
}

export async function loadPaymentReviewDetail(
  context: AdminContext,
  paymentId: string,
) {
  if (!z.uuid().safeParse(paymentId).success) {
    return { status: "missing" } as const;
  }

  const contextResult = await context.supabase
    .schema("api")
    .rpc("get_admin_payment_review_context", { p_payment_id: paymentId });
  const parsed = paymentReviewContextSchema.safeParse(contextResult.data);

  if (contextResult.error?.code === "P0002") {
    return { status: "missing" } as const;
  }
  if (contextResult.error?.code === "P0001") {
    return { status: "stale" } as const;
  }
  if (contextResult.error || !parsed.success) {
    return { status: "error" } as const;
  }

  return {
    audit: parsed.data.audit,
    item: parsed.data.detail,
    status: "success",
  } as const;
}
