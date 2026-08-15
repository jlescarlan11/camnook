import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { cleanupDueVerificationEvidence } from "./cleanup";

const OWNER_ID = "30000000-0000-4000-8000-000000000001";
const INTENT_ID = "31000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "39000000-0000-4000-8000-000000000030";
const INTENT_PATH = `${OWNER_ID}/32000000-0000-4000-8000-000000000001/${INTENT_ID}.jpg`;
const DOCUMENT_PATH = `${OWNER_ID}/32000000-0000-4000-8000-000000000001/${DOCUMENT_ID}.png`;

describe("due verification evidence cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes claimed objects and records verified absence without returning paths", async () => {
    const rpc = vi.fn(async (name: string) => {
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

    expect(result).toEqual({ claimed: 2, cleaned: 2, failed: 0 });
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
      .mockResolvedValueOnce({
        data: null,
        error: { message: "storage unavailable" },
      })
      .mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as never);

    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 1,
      cleaned: 0,
      failed: 1,
    });
    await expect(cleanupDueVerificationEvidence()).resolves.toEqual({
      claimed: 1,
      cleaned: 1,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledWith(
      "finalize_due_verification_document_deletion",
      expect.objectContaining({ p_document_id: DOCUMENT_ID }),
    );
  });
});
