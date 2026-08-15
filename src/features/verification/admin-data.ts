import "server-only";

import { z } from "zod";

import type { requireAdmin } from "@/lib/auth/require-admin";

import {
  verificationReviewDetailSchema,
  verificationReviewQueueSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export async function loadVerificationReviewQueue(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_verification_review_queue");
  const parsed = verificationReviewQueueSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;

  return { items: parsed.data, status: "success" } as const;
}

export async function loadVerificationReviewDetail(
  context: AdminContext,
  recordId: string,
) {
  if (!z.uuid().safeParse(recordId).success) {
    return { status: "missing" } as const;
  }

  const result = await context.supabase
    .schema("api")
    .rpc("get_verification_review_detail", { p_record_id: recordId });
  const parsed = verificationReviewDetailSchema.safeParse(result.data);

  if (result.error?.code === "P0002") return { status: "missing" } as const;
  if (result.error || !parsed.success) return { status: "error" } as const;

  return { item: parsed.data, status: "success" } as const;
}
