import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";
import type { requireUser } from "@/lib/auth/require-user";

import {
  paymentAccountingSummarySchema,
  paymentAuditHistorySchema,
  paymentReviewDetailSchema,
  paymentReviewQueueSchema,
  paymentStateSchema,
} from "./types";

type UserContext = Awaited<ReturnType<typeof requireUser>>;
type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

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

  const detailResult = await context.supabase
    .schema("api")
    .rpc("get_payment_review_detail", { p_payment_id: paymentId });
  const detail = paymentReviewDetailSchema.safeParse(detailResult.data);

  if (detailResult.error?.code === "P0002") {
    return { status: "missing" } as const;
  }
  if (detailResult.error?.code === "P0001") {
    return { status: "stale" } as const;
  }
  if (detailResult.error || !detail.success) {
    return { status: "error" } as const;
  }

  const auditResult = await context.supabase
    .schema("api")
    .rpc("get_payment_audit_history", {
      p_booking_id: detail.data.booking_id,
    });
  const audit = paymentAuditHistorySchema.safeParse(auditResult.data);

  if (auditResult.error || !audit.success) {
    return { status: "error" } as const;
  }

  return {
    audit: audit.data,
    item: detail.data,
    status: "success",
  } as const;
}
