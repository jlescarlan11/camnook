import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const cleanupClaimSchema = z.array(
  z.object({
    id: z.uuid(),
    kind: z.enum(["upload_intent", "verification_document"]),
    object_path: z.string().min(1),
    owner_user_id: z.uuid(),
  }),
);

const CLEANUP_BATCH_SIZE = 100;
const MAX_CLEANUP_ITEMS = 1000;

export type VerificationCleanupSummary = {
  claimed: number;
  cleaned: number;
  failed: number;
};

export async function cleanupDueVerificationEvidence(): Promise<VerificationCleanupSummary> {
  const admin = createSupabaseAdminClient();
  const operationId = randomUUID();
  const claim = await admin.schema("api").rpc(
    "claim_verification_evidence_cleanup",
    { p_limit: MAX_CLEANUP_ITEMS, p_operation_id: operationId },
  );
  const claimed = cleanupClaimSchema.safeParse(claim.data);

  if (claim.error || !claimed.success) {
    throw new Error("Unable to claim due verification evidence cleanup");
  }

  let cleaned = 0;
  let failed = 0;
  const bucket = admin.storage.from("verification-documents");

  for (let index = 0; index < claimed.data.length; index += CLEANUP_BATCH_SIZE) {
    const batch = claimed.data.slice(index, index + CLEANUP_BATCH_SIZE);
    const removed = await bucket.remove(batch.map((item) => item.object_path));

    if (removed.error) {
      failed += batch.length;
      continue;
    }

    const results = await Promise.all(
      batch.map((item) => {
        if (item.kind === "upload_intent") {
          return admin.schema("api").rpc(
            "finalize_due_verification_upload_cleanup",
            {
              p_intent_id: item.id,
              p_operation_id: randomUUID(),
              p_owner_user_id: item.owner_user_id,
            },
          );
        }

        return admin.schema("api").rpc(
          "finalize_due_verification_document_deletion",
          {
            p_document_id: item.id,
            p_operation_id: randomUUID(),
            p_owner_user_id: item.owner_user_id,
          },
        );
      }),
    );

    for (const result of results) {
      if (result.error) failed += 1;
      else cleaned += 1;
    }
  }

  return { claimed: claimed.data.length, cleaned, failed };
}
