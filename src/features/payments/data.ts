import "server-only";

import { z } from "zod";

import {
  isAdminAuthorizationError,
  type requireAdmin,
} from "@/lib/auth/require-admin";

import {
  paymentAuditHistorySchema,
  paymentReviewDetailSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

const paymentReviewContextSchema = z.object({
  audit: paymentAuditHistorySchema,
  detail: paymentReviewDetailSchema,
}).strict();

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

  if (isAdminAuthorizationError(contextResult.error)) {
    return { status: "forbidden" } as const;
  }
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
