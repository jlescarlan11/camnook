import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  class AdminAuthorizationRequiredError extends Error {}
  return {
    AdminAuthorizationRequiredError,
    isAuthenticationError: (error: unknown) =>
      error instanceof Error && error.name === "AuthenticationRequiredError",
    requireAdmin: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import {
  AdminAuthorizationRequiredError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  decideVerification,
  requestVerificationEvidenceAccess,
} from "./admin-actions";

const RECORD_ID = "41000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "42000000-0000-4000-8000-000000000001";
const OBJECT_PATH = `40000000-0000-4000-8000-000000000001/${RECORD_ID}/${DOCUMENT_ID}.png`;

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function authorizeRpc(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema },
    user: { id: "admin" },
  } as never);
  return { rpc, schema };
}

describe("admin verification actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T04:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("validates evidence references before authorization", async () => {
    await expect(
      requestVerificationEvidenceAccess(
        { status: "idle" },
        fields({ recordId: "invalid" }),
      ),
    ).resolves.toEqual({ error: "invalid", status: "error" });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("denies direct evidence access when admin authorization fails", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new AdminAuthorizationRequiredError(),
    );

    await expect(
      requestVerificationEvidenceAccess(
        { status: "idle" },
        fields({ recordId: RECORD_ID }),
      ),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("authorizes the exact purpose before issuing one 60-second signed URL", async () => {
    const api = authorizeRpc({
      data: {
        document_id: DOCUMENT_ID,
        expires_in_seconds: 60,
        object_path: OBJECT_PATH,
        record_id: RECORD_ID,
      },
      error: null,
    });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.test/signed-token" },
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as never);

    const result = await requestVerificationEvidenceAccess(
      { status: "idle" },
      fields({ recordId: RECORD_ID, purpose: "attacker-choice" }),
    );

    expect(api.rpc).toHaveBeenCalledWith(
      "authorize_verification_evidence_access",
      {
        p_operation_id: expect.any(String),
        p_purpose: "identity_review",
        p_record_id: RECORD_ID,
      },
    );
    expect(createSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, 60);
    expect(result).toEqual({
      documentId: DOCUMENT_ID,
      expiresAt: "2026-08-15T04:01:00.000Z",
      signedUrl: "https://storage.test/signed-token",
      status: "success",
    });
    expect(JSON.stringify(result)).not.toContain(OBJECT_PATH);
  });

  it("does not return a non-web signed URL", async () => {
    authorizeRpc({
      data: {
        document_id: DOCUMENT_ID,
        expires_in_seconds: 60,
        object_path: OBJECT_PATH,
        record_id: RECORD_ID,
      },
      error: null,
    });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "javascript:alert('unsafe')" },
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as never);

    await expect(
      requestVerificationEvidenceAccess(
        { status: "idle" },
        fields({ recordId: RECORD_ID }),
      ),
    ).resolves.toEqual({ error: "unavailable", status: "error" });
  });

  it("accepts only approved verification metadata and revalidates every consumer", async () => {
    const api = authorizeRpc({
      data: {
        decided_at: "2026-08-15T04:00:00Z",
        record_id: RECORD_ID,
        status: "verified",
      },
      error: null,
    });

    await expect(
      decideVerification(
        { status: "idle" },
        fields({
          approvedIdType: "umid",
          decision: "verified",
          documentExpirationDate: "2026-08-16",
          recordId: RECORD_ID,
          rejectionReasonCode: "attacker-choice",
          reviewedDocumentId: DOCUMENT_ID,
        }),
      ),
    ).resolves.toEqual({ action: "verify", status: "success" });
    expect(api.rpc).toHaveBeenCalledWith("decide_verification", {
      p_approved_id_type: "umid",
      p_decision: "verified",
      p_document_expiration_date: "2026-08-16",
      p_operation_id: expect.any(String),
      p_record_id: RECORD_ID,
      p_reviewed_document_id: DOCUMENT_ID,
      p_rejection_reason_code: "",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/verifications/${RECORD_ID}`,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });

  it("requires the exact reviewed document before any decision", async () => {
    const result = await decideVerification(
      { status: "idle" },
      fields({
        decision: "rejected",
        recordId: RECORD_ID,
        rejectionReasonCode: "document_not_readable",
      }),
    );

    expect(result.fieldErrors?.reviewedDocumentId).toBe(
      "Request access to the current evidence before deciding.",
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("requires an expiration after the current Manila business date", async () => {
    await expect(
      decideVerification(
        { status: "idle" },
        fields({
          approvedIdType: "umid",
          decision: "verified",
          documentExpirationDate: "2026-08-15",
          recordId: RECORD_ID,
          reviewedDocumentId: DOCUMENT_ID,
        }),
      ),
    ).resolves.toEqual({
      action: "verify",
      fieldErrors: {
        documentExpirationDate:
          "Expiration must be after today in Asia/Manila.",
      },
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("rejects impossible calendar dates before authorization", async () => {
    const result = await decideVerification(
      { status: "idle" },
      fields({
        approvedIdType: "umid",
        decision: "verified",
        documentExpirationDate: "2027-02-31",
        recordId: RECORD_ID,
        reviewedDocumentId: DOCUMENT_ID,
      }),
    );

    expect(result.fieldErrors?.documentExpirationDate).toBe(
      "Expiration must be after today in Asia/Manila.",
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("rejects free text and sends only a renter-safe reason code", async () => {
    await expect(
      decideVerification(
        { status: "idle" },
        fields({
          decision: "rejected",
          recordId: RECORD_ID,
          rejectionReasonCode: "free text containing ID details",
          reviewedDocumentId: DOCUMENT_ID,
        }),
      ),
    ).resolves.toEqual({
      action: "reject",
      fieldErrors: { rejectionReasonCode: "Choose a safe rejection reason." },
      status: "error",
    });

    const api = authorizeRpc({
      data: {
        decided_at: "2026-08-15T04:00:00Z",
        record_id: RECORD_ID,
        status: "rejected",
      },
      error: null,
    });
    await expect(
      decideVerification(
        { status: "idle" },
        fields({
          decision: "rejected",
          recordId: RECORD_ID,
          rejectionReasonCode: "document_not_readable",
          reviewedDocumentId: DOCUMENT_ID,
        }),
      ),
    ).resolves.toEqual({ action: "reject", status: "success" });
    expect(api.rpc).toHaveBeenCalledWith(
      "decide_verification",
      expect.objectContaining({
        p_approved_id_type: "",
        p_document_expiration_date: "",
        p_rejection_reason_code: "document_not_readable",
        p_reviewed_document_id: DOCUMENT_ID,
      }),
    );
  });

  it("maps provider failures without returning private details", async () => {
    authorizeRpc({
      data: null,
      error: { code: "P0001", message: "verification_decision_stale secret" },
    });

    const result = await decideVerification(
      { status: "idle" },
      fields({
        decision: "rejected",
        recordId: RECORD_ID,
        rejectionReasonCode: "document_expired",
        reviewedDocumentId: DOCUMENT_ID,
      }),
    );

    expect(result).toEqual({ action: "reject", error: "stale", status: "error" });
    expect(JSON.stringify(result)).not.toMatch(/secret|verification_decision/);
  });
});
