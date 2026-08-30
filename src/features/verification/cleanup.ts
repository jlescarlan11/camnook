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

const abandonedUploadClaimSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({
      bucket_id: z.literal("payment-proofs"),
      id: z.uuid(),
      kind: z.literal("payment_proof_upload_intent"),
      object_path: z.string().min(1),
    }),
    z.object({
      bucket_id: z.literal("condition-evidence"),
      id: z.uuid(),
      kind: z.literal("condition_photo_upload_intent"),
      object_path: z.string().min(1),
    }),
  ]),
);

const CLEANUP_BATCH_SIZE = 100;
const FINALIZE_CONCURRENCY = 10;
const ABANDONED_UPLOAD_CLAIM_LIMIT = 100;
// The legacy verification claim applies this limit once to upload intents and
// once to retained documents, so 50 bounds its combined result to 100 items.
const VERIFICATION_CLAIM_LIMIT_PER_KIND = 50;

export type VerificationCleanupSummary = {
  claimed: number;
  cleaned: number;
  expired: number;
  failed: number;
};

export type AbandonedUploadCleanupSummary = {
  claimed: number;
  cleaned: number;
  failed: number;
};

export async function cleanupAbandonedPrivateUploads(): Promise<AbandonedUploadCleanupSummary> {
  const admin = createSupabaseAdminClient();
  const claim = await admin.schema("api").rpc(
    "claim_abandoned_private_upload_cleanup",
    { p_limit: ABANDONED_UPLOAD_CLAIM_LIMIT, p_operation_id: randomUUID() },
  );
  const claimed = abandonedUploadClaimSchema.safeParse(claim.data);

  if (claim.error || !claimed.success) {
    throw new Error("Unable to claim abandoned private upload cleanup");
  }

  let cleaned = 0;
  let failed = 0;

  for (const bucketId of ["payment-proofs", "condition-evidence"] as const) {
    const bucketItems = claimed.data.filter((item) => item.bucket_id === bucketId);
    const bucket = admin.storage.from(bucketId);

    for (let index = 0; index < bucketItems.length; index += CLEANUP_BATCH_SIZE) {
      const batch = bucketItems.slice(index, index + CLEANUP_BATCH_SIZE);
      const removed = await bucket.remove(batch.map((item) => item.object_path));

      if (removed.error) {
        failed += batch.length;
        continue;
      }

      for (
        let finalizeIndex = 0;
        finalizeIndex < batch.length;
        finalizeIndex += FINALIZE_CONCURRENCY
      ) {
        const finalizeBatch = batch.slice(
          finalizeIndex,
          finalizeIndex + FINALIZE_CONCURRENCY,
        );
        const results = await Promise.allSettled(
          finalizeBatch.map((item) =>
            admin.schema("api").rpc(
              "finalize_abandoned_private_upload_cleanup",
              {
                p_intent_id: item.id,
                p_kind: item.kind,
                p_operation_id: randomUUID(),
              },
            ),
          ),
        );

        for (const result of results) {
          if (result.status === "rejected" || result.value.error) failed += 1;
          else cleaned += 1;
        }
      }
    }
  }

  return { claimed: claimed.data.length, cleaned, failed };
}

export async function cleanupDueVerificationEvidence(): Promise<VerificationCleanupSummary> {
  const admin = createSupabaseAdminClient();
  let expired = 0;
  let failed = 0;
  try {
    const expiry = await admin.schema("api").rpc("expire_due_verifications", {
      p_operation_id: randomUUID(),
    });
    const parsedExpiry = z.number().int().nonnegative().safeParse(expiry.data);
    if (expiry.error || !parsedExpiry.success) failed += 1;
    else expired = parsedExpiry.data;
  } catch {
    failed += 1;
  }

  const operationId = randomUUID();
  let claim;
  try {
    claim = await admin.schema("api").rpc(
      "claim_verification_evidence_cleanup",
      { p_limit: VERIFICATION_CLAIM_LIMIT_PER_KIND, p_operation_id: operationId },
    );
  } catch {
    return { claimed: 0, cleaned: 0, expired, failed: failed + 1 };
  }
  const claimed = cleanupClaimSchema.safeParse(claim.data);

  if (claim.error || !claimed.success) {
    return { claimed: 0, cleaned: 0, expired, failed: failed + 1 };
  }

  let cleaned = 0;
  const bucket = admin.storage.from("verification-documents");

  for (let index = 0; index < claimed.data.length; index += CLEANUP_BATCH_SIZE) {
    const batch = claimed.data.slice(index, index + CLEANUP_BATCH_SIZE);
    const removed = await bucket.remove(batch.map((item) => item.object_path));

    if (removed.error) {
      failed += batch.length;
      continue;
    }

    for (
      let finalizeIndex = 0;
      finalizeIndex < batch.length;
      finalizeIndex += FINALIZE_CONCURRENCY
    ) {
      const finalizeBatch = batch.slice(
        finalizeIndex,
        finalizeIndex + FINALIZE_CONCURRENCY,
      );
      const results = await Promise.allSettled(
        finalizeBatch.map((item) => {
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
        if (result.status === "rejected" || result.value.error) failed += 1;
        else cleaned += 1;
      }
    }
  }

  return {
    claimed: claimed.data.length,
    cleaned,
    expired,
    failed,
  };
}
