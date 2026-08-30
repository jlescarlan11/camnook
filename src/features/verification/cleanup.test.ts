import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  cleanupAbandonedPrivateUploads,
  cleanupDueVerificationEvidence,
} from "./cleanup";

const OWNER_ID = "30000000-0000-4000-8000-000000000001";
const INTENT_ID = "31000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "39000000-0000-4000-8000-000000000030";
const INTENT_PATH = `${OWNER_ID}/32000000-0000-4000-8000-000000000001/${INTENT_ID}.jpg`;
const DOCUMENT_PATH = `${OWNER_ID}/32000000-0000-4000-8000-000000000001/${DOCUMENT_ID}.png`;

describe("due verification evidence cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes claimed objects and records verified absence without returning paths", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "expire_due_verifications") {
        return { data: 1, error: null };
      }
      if (name === "claim_verification_evidence_cleanup") {
        return {
          data: [
            {
              id: INTENT_ID,
              kind: "upload_intent",
              object_path: INTENT_PATH,
              owner_user_id: OWNER_ID,
            },
            {
              id: DOCUMENT_ID,
              kind: "verification_document",
              object_path: DOCUMENT_PATH,
              owner_user_id: OWNER_ID,
            },
          ],
          error: null,
        };
      }
      if (
        name === "finalize_due_verification_upload_cleanup" ||
        name === "finalize_due_verification_document_deletion"
      ) {
        return { data: { status: "cleaned" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    const result = await cleanupDueVerificationEvidence();

    expect(result).toEqual({ claimed: 2, cleaned: 2, expired: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith(
      "expire_due_verifications",
      expect.objectContaining({ p_operation_id: expect.any(String) }),
    );
    expect(rpc).toHaveBeenCalledWith("claim_verification_evidence_cleanup", {
      p_limit: 50,
      p_operation_id: expect.any(String),
    });
    expect(remove).toHaveBeenCalledWith([INTENT_PATH, DOCUMENT_PATH]);
    expect(rpc).toHaveBeenCalledWith(
      "finalize_due_verification_upload_cleanup",
      expect.objectContaining({ p_intent_id: INTENT_ID, p_owner_user_id: OWNER_ID }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_due_verification_document_deletion",
      expect.objectContaining({
        p_document_id: DOCUMENT_ID,
        p_owner_user_id: OWNER_ID,
      }),
    );
    expect(JSON.stringify(result)).not.toContain(OWNER_ID);
    expect(JSON.stringify(result)).not.toContain(INTENT_PATH);
  });

  it("retries a durable claim after a transient Storage removal failure", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "expire_due_verifications") {
        return { data: 0, error: null };
      }
      if (name === "claim_verification_evidence_cleanup") {
        return {
          data: [
            {
              id: DOCUMENT_ID,
              kind: "verification_document",
              object_path: DOCUMENT_PATH,
              owner_user_id: OWNER_ID,
            },
          ],
          error: null,
        };
      }
      if (name === "finalize_due_verification_document_deletion") {
        return { data: { status: "deleted" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("private storage detail"))
      .mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 1,
      cleaned: 0,
      expired: 0,
      failed: 1,
    });
    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 1,
      cleaned: 1,
      expired: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledWith(
      "finalize_due_verification_document_deletion",
      expect.objectContaining({ p_document_id: DOCUMENT_ID }),
    );
  });

  it("limits concurrent database finalization after a successful Storage batch", async () => {
    const claimedItems = Array.from({ length: 25 }, (_, index) => {
      const suffix = (index + 1).toString(16).padStart(12, "0");
      const id = `39000000-0000-4000-8000-${suffix}`;

      return {
        id,
        kind: "verification_document" as const,
        object_path: `${OWNER_ID}/32000000-0000-4000-8000-000000000001/${id}.png`,
        owner_user_id: OWNER_ID,
      };
    });
    let activeFinalizations = 0;
    let peakFinalizations = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === "expire_due_verifications") {
        return { data: 0, error: null };
      }
      if (name === "claim_verification_evidence_cleanup") {
        return { data: claimedItems, error: null };
      }
      if (name === "finalize_due_verification_document_deletion") {
        activeFinalizations += 1;
        peakFinalizations = Math.max(peakFinalizations, activeFinalizations);
        await Promise.resolve();
        activeFinalizations -= 1;
        return { data: { status: "deleted" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 25,
      cleaned: 25,
      expired: 0,
      failed: 0,
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(peakFinalizations).toBe(10);
  });

  it.each(["throws", "returns malformed data"] as const)(
    "accounts for sibling finalizations when one database request %s",
    async (failureMode) => {
      const rpc = vi.fn(async (name: string) => {
        if (name === "expire_due_verifications") {
          return { data: 0, error: null };
        }
        if (name === "claim_verification_evidence_cleanup") {
          return {
            data: [
              {
                id: INTENT_ID,
                kind: "upload_intent",
                object_path: INTENT_PATH,
                owner_user_id: OWNER_ID,
              },
              {
                id: DOCUMENT_ID,
                kind: "verification_document",
                object_path: DOCUMENT_PATH,
                owner_user_id: OWNER_ID,
              },
            ],
            error: null,
          };
        }
        if (name === "finalize_due_verification_upload_cleanup") {
          if (failureMode === "throws") {
            throw new Error("private network detail");
          }
          return { data: null, error: null };
        }
        if (name === "finalize_due_verification_document_deletion") {
          return { data: { status: "deleted" }, error: null };
        }
        throw new Error(`unexpected RPC: ${name}`);
      });
      const remove = vi.fn().mockResolvedValue({ data: [], error: null });
      vi.mocked(createSupabaseAdminClient).mockReturnValue({
        schema: vi.fn(() => ({ rpc })),
        storage: { from: vi.fn(() => ({ remove })) },
      } as never);

      await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
        claimed: 2,
        cleaned: 1,
        expired: 0,
        failed: 1,
      });
    },
  );

  it.each(["returns an error", "throws"] as const)(
    "continues evidence cleanup when Manila-date expiry %s",
    async (failureMode) => {
      const rpc = vi.fn(async (name: string) => {
        if (name === "expire_due_verifications") {
          if (failureMode === "throws") {
            throw new Error("private network detail");
          }
          return { data: null, error: { message: "private database detail" } };
        }
        if (name === "claim_verification_evidence_cleanup") {
          return {
            data: [
              {
                id: DOCUMENT_ID,
                kind: "verification_document",
                object_path: DOCUMENT_PATH,
                owner_user_id: OWNER_ID,
              },
            ],
            error: null,
          };
        }
        if (name === "finalize_due_verification_document_deletion") {
          return { data: { status: "deleted" }, error: null };
        }
        throw new Error(`unexpected RPC: ${name}`);
      });
      const remove = vi.fn().mockResolvedValue({ data: [], error: null });
      vi.mocked(createSupabaseAdminClient).mockReturnValue({
        schema: vi.fn(() => ({ rpc })),
        storage: { from: vi.fn(() => ({ remove })) },
      } as never);

      await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
        claimed: 1,
        cleaned: 1,
        expired: 0,
        failed: 1,
      });
      expect(remove).toHaveBeenCalledWith([DOCUMENT_PATH]);
    },
  );

  it.each(["returns an error", "throws"] as const)(
    "preserves completed expiry counts when the evidence claim %s",
    async (failureMode) => {
      const rpc = vi.fn(async (name: string) => {
        if (name === "expire_due_verifications") {
          return { data: 2, error: null };
        }
        if (name === "claim_verification_evidence_cleanup") {
          if (failureMode === "throws") {
            throw new Error("private network detail");
          }
          return { data: null, error: { message: "private database detail" } };
        }
        throw new Error(`unexpected RPC: ${name}`);
      });
      const remove = vi.fn();
      vi.mocked(createSupabaseAdminClient).mockReturnValue({
        schema: vi.fn(() => ({ rpc })),
        storage: { from: vi.fn(() => ({ remove })) },
      } as never);

      await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
        claimed: 0,
        cleaned: 0,
        expired: 2,
        failed: 1,
      });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized verification claim before calling Storage", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "expire_due_verifications") return { data: 0, error: null };
      if (name === "claim_verification_evidence_cleanup") {
        return {
          data: Array.from({ length: 101 }, () => ({
            id: DOCUMENT_ID,
            kind: "verification_document",
            object_path: DOCUMENT_PATH,
            owner_user_id: OWNER_ID,
          })),
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi.fn();
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 0,
      cleaned: 0,
      expired: 0,
      failed: 1,
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("abandoned private upload cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes each private evidence kind from only its declared bucket", async () => {
    const paymentIntentId = "61000000-0000-4000-8000-000000000001";
    const conditionIntentId = "81000000-0000-4000-8000-000000000001";
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_abandoned_private_upload_cleanup") {
        return {
          data: [
            {
              bucket_id: "payment-proofs",
              id: paymentIntentId,
              kind: "payment_proof_upload_intent",
              object_path: `${paymentIntentId}/proof.jpg`,
            },
            {
              bucket_id: "condition-evidence",
              id: conditionIntentId,
              kind: "condition_photo_upload_intent",
              object_path: `booking/report/${conditionIntentId}.png`,
            },
          ],
          error: null,
        };
      }
      if (name === "finalize_abandoned_private_upload_cleanup") {
        return { data: { status: "cleaned" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const paymentRemove = vi.fn().mockResolvedValue({ data: [], error: null });
    const conditionRemove = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn((bucket: string) => ({
      remove: bucket === "payment-proofs" ? paymentRemove : conditionRemove,
    }));
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from },
    } as never);

    await expect(cleanupAbandonedPrivateUploads()).resolves.toEqual({
      claimed: 2,
      cleaned: 2,
      failed: 0,
    });
    expect(paymentRemove).toHaveBeenCalledWith([`${paymentIntentId}/proof.jpg`]);
    expect(conditionRemove).toHaveBeenCalledWith([
      `booking/report/${conditionIntentId}.png`,
    ]);
    expect(rpc).toHaveBeenCalledWith("claim_abandoned_private_upload_cleanup", {
      p_limit: 100,
      p_operation_id: expect.any(String),
    });
    expect(rpc).toHaveBeenCalledWith(
      "finalize_abandoned_private_upload_cleanup",
      expect.objectContaining({
        p_intent_id: paymentIntentId,
        p_kind: "payment_proof_upload_intent",
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_abandoned_private_upload_cleanup",
      expect.objectContaining({
        p_intent_id: conditionIntentId,
        p_kind: "condition_photo_upload_intent",
      }),
    );
  });

  it("leaves a durable claim retryable when one bucket deletion fails", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_abandoned_private_upload_cleanup") {
        return {
          data: [
            {
              bucket_id: "payment-proofs",
              id: "61000000-0000-4000-8000-000000000002",
              kind: "payment_proof_upload_intent",
              object_path: "payment/retry.jpg",
            },
          ],
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "storage unavailable" },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupAbandonedPrivateUploads()).resolves.toEqual({
      claimed: 1,
      cleaned: 0,
      failed: 1,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "finalize_abandoned_private_upload_cleanup",
      expect.anything(),
    );
  });

  it("continues with the other private bucket when Storage removal throws", async () => {
    const paymentId = "61000000-0000-4000-8000-000000000005";
    const conditionId = "81000000-0000-4000-8000-000000000005";
    const rpc = vi.fn(async (name: string, input?: { p_intent_id?: string }) => {
      if (name === "claim_abandoned_private_upload_cleanup") {
        return {
          data: [
            {
              bucket_id: "payment-proofs",
              id: paymentId,
              kind: "payment_proof_upload_intent",
              object_path: `${paymentId}/proof.jpg`,
            },
            {
              bucket_id: "condition-evidence",
              id: conditionId,
              kind: "condition_photo_upload_intent",
              object_path: `booking/report/${conditionId}.png`,
            },
          ],
          error: null,
        };
      }
      if (name === "finalize_abandoned_private_upload_cleanup") {
        return { data: { id: input?.p_intent_id, status: "cleaned" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const paymentRemove = vi.fn().mockRejectedValue(new Error("private detail"));
    const conditionRemove = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: {
        from: vi.fn((bucket: string) => ({
          remove: bucket === "payment-proofs" ? paymentRemove : conditionRemove,
        })),
      },
    } as never);

    await expect(cleanupAbandonedPrivateUploads()).resolves.toEqual({
      claimed: 2,
      cleaned: 1,
      failed: 1,
    });
    expect(conditionRemove).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "finalize_abandoned_private_upload_cleanup",
      expect.objectContaining({ p_intent_id: conditionId }),
    );
  });

  it("accounts for sibling intent finalizations when one request throws", async () => {
    const firstId = "61000000-0000-4000-8000-000000000003";
    const secondId = "61000000-0000-4000-8000-000000000004";
    const rpc = vi.fn(async (name: string, input?: { p_intent_id?: string }) => {
      if (name === "claim_abandoned_private_upload_cleanup") {
        return {
          data: [firstId, secondId].map((id) => ({
            bucket_id: "payment-proofs",
            id,
            kind: "payment_proof_upload_intent",
            object_path: `${id}/proof.jpg`,
          })),
          error: null,
        };
      }
      if (name === "finalize_abandoned_private_upload_cleanup") {
        if (input?.p_intent_id === firstId) {
          throw new Error("private network detail");
        }
        return { data: { status: "cleaned" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupAbandonedPrivateUploads()).resolves.toEqual({
      claimed: 2,
      cleaned: 1,
      failed: 1,
    });
  });
});
