import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  requestVerificationEvidenceDeletion,
  submitVerificationEvidence,
} from "./actions";

const DOCUMENT_ID = "39000000-0000-4000-8000-000000000030";
const OBJECT_PATH =
  "30000000-0000-4000-8000-000000000001/32000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001.jpg";
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);

const policy = {
  allowed_id_types: [
    "philippine_passport",
    "philsys_id",
    "drivers_license",
    "umid",
  ],
  allowed_media_types: ["image/jpeg", "image/png", "application/pdf"],
  document_retention_days: 30,
  enabled: true,
  max_byte_size: 5 * 1024 * 1024,
  policy_version: "government-id-evidence-v1",
  privacy_notice_version: "government-id-privacy-v1",
  upload_intent_seconds: 900,
};

function uploadForm(file = new File([JPEG_BYTES], "id.jpg", { type: "image/jpeg" })) {
  const data = new FormData();
  data.set("document", file);
  data.set("idType", "philippine_passport");
  data.set("policyVersion", policy.policy_version);
  data.set("privacyAcknowledgement", "accepted");
  data.set("privacyNoticeVersion", policy.privacy_notice_version);
  return data;
}

function intentIdFrom(args: unknown) {
  return (args as { p_intent_id: string }).p_intent_id;
}

function mockClient(
  rpcImplementation: (name: string, args?: unknown) => Promise<unknown>,
  downloadedBytes = JPEG_BYTES,
) {
  const rpc = vi.fn(rpcImplementation);
  const upload = vi.fn().mockResolvedValue({ data: { path: OBJECT_PATH }, error: null });
  const download = vi.fn().mockResolvedValue({
    data: new Blob([downloadedBytes], { type: "image/jpeg" }),
    error: null,
  });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const bucket = { download, remove, upload };
  const client = {
    schema: vi.fn(() => ({ rpc })),
    storage: { from: vi.fn(() => bucket) },
  };
  vi.mocked(requireUser).mockResolvedValue({
    supabase: client,
    user: { id: "30000000-0000-4000-8000-000000000001" },
  } as never);
  vi.mocked(createSupabaseAdminClient).mockReturnValue(client as never);
  return { bucket, client, rpc };
}

describe("government ID evidence actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid input or a missing privacy acknowledgement before authentication", async () => {
    const invalid = new FormData();
    invalid.set("idType", "not-approved");

    await expect(
      submitVerificationEvidence({ status: "idle" }, invalid),
    ).resolves.toMatchObject({ error: "invalid_input", status: "error" });
    expect(requireUser).not.toHaveBeenCalled();

    const noConsent = uploadForm();
    noConsent.delete("privacyAcknowledgement");
    await expect(
      submitVerificationEvidence({ status: "idle" }, noConsent),
    ).resolves.toEqual({ error: "privacy_not_accepted", status: "error" });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("fails closed if the notice changed after the page was rendered", async () => {
    const { rpc } = mockClient(async (name) => {
      expect(name).toBe("get_verification_upload_policy");
      return {
        data: { ...policy, privacy_notice_version: "government-id-privacy-v2" },
        error: null,
      };
    });

    await expect(
      submitVerificationEvidence({ status: "idle" }, uploadForm()),
    ).resolves.toEqual({ error: "policy_unavailable", status: "error" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("verifies the stored bytes and finalizes exactly one pending submission", async () => {
    const { bucket, rpc } = mockClient(async (name, args) => {
      if (name === "get_verification_upload_policy") {
        return { data: policy, error: null };
      }
      if (name === "create_verification_upload_intent") {
        return {
          data: {
            byte_size: JPEG_BYTES.byteLength,
            document_id: DOCUMENT_ID,
            expires_at: "2099-08-15T00:15:00Z",
            id: intentIdFrom(args),
            media_type: "image/jpeg",
            object_path: OBJECT_PATH,
            record_id: "32000000-0000-4000-8000-000000000001",
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "finalize_verification_upload") {
        return {
          data: { document_id: DOCUMENT_ID, status: "pending" },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });

    const result = await submitVerificationEvidence(
      { status: "idle" },
      uploadForm(),
    );

    expect(result).toEqual({ status: "success" });
    expect(bucket.upload).toHaveBeenCalledWith(
      OBJECT_PATH,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
    expect(bucket.download).toHaveBeenCalledWith(OBJECT_PATH);
    expect(rpc).toHaveBeenCalledWith(
      "finalize_verification_upload",
      expect.objectContaining({
        p_intent_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        p_verified_byte_size: JPEG_BYTES.byteLength,
        p_verified_media_type: "image/jpeg",
        p_verified_sha256_hex: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/account");
    expect(JSON.stringify(result)).not.toContain(OBJECT_PATH);
  });

  it("reconciles an upload retry when the exact object already exists", async () => {
    const existingIntentId = "31000000-0000-4000-8000-000000000010";
    const { bucket, rpc } = mockClient(async (name) => {
      if (name === "get_verification_upload_policy") return { data: policy, error: null };
      if (name === "create_verification_upload_intent") {
        return {
          data: {
            byte_size: JPEG_BYTES.byteLength,
            document_id: DOCUMENT_ID,
            expires_at: "2099-08-15T00:15:00Z",
            id: existingIntentId,
            media_type: "image/jpeg",
            object_path: OBJECT_PATH,
            record_id: "32000000-0000-4000-8000-000000000001",
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "finalize_verification_upload") {
        return { data: { status: "pending" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    bucket.upload.mockResolvedValue({
      data: null,
      error: { message: "object already exists" },
    });

    await expect(
      submitVerificationEvidence({ status: "idle" }, uploadForm()),
    ).resolves.toEqual({ status: "success" });
    expect(bucket.download).toHaveBeenCalledWith(OBJECT_PATH);
    expect(bucket.remove).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "finalize_verification_upload",
      expect.objectContaining({ p_intent_id: existingIntentId }),
    );
  });

  it("cleans an active intent before starting a different upload", async () => {
    const openIntentId = "31000000-0000-4000-8000-000000000020";
    const openObjectPath =
      "30000000-0000-4000-8000-000000000001/32000000-0000-4000-8000-000000000001/34000000-0000-4000-8000-000000000001.png";
    let createCalls = 0;
    const { bucket, rpc } = mockClient(async (name, args) => {
      if (name === "get_verification_upload_policy") return { data: policy, error: null };
      if (name === "create_verification_upload_intent") {
        createCalls += 1;
        if (createCalls === 1) {
          return {
            data: null,
            error: { code: "55000", message: "another upload is already in progress" },
          };
        }
        return {
          data: {
            byte_size: JPEG_BYTES.byteLength,
            document_id: DOCUMENT_ID,
            expires_at: "2099-08-15T00:15:00Z",
            id: intentIdFrom(args),
            media_type: "image/jpeg",
            object_path: OBJECT_PATH,
            record_id: "32000000-0000-4000-8000-000000000001",
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "get_my_verification_upload_state") {
        return {
          data: {
            document: null,
            documents: [],
            intent: {
              byte_size: JPEG_BYTES.byteLength,
              document_id: "34000000-0000-4000-8000-000000000001",
              expires_at: "2099-08-15T00:15:00Z",
              id: openIntentId,
              media_type: "image/png",
              record_id: "32000000-0000-4000-8000-000000000001",
              status: "awaiting_upload",
            },
            policy,
            record: null,
          },
          error: null,
        };
      }
      if (name === "prepare_verification_upload_cleanup") {
        return {
          data: {
            id: openIntentId,
            object_path: openObjectPath,
            status: "cleanup_pending",
          },
          error: null,
        };
      }
      if (name === "finalize_verification_upload_cleanup") {
        return { data: { id: openIntentId, status: "cleaned" }, error: null };
      }
      if (name === "finalize_verification_upload") {
        return { data: { document_id: DOCUMENT_ID, status: "pending" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });

    await expect(
      submitVerificationEvidence({ status: "idle" }, uploadForm()),
    ).resolves.toEqual({ status: "success" });
    expect(createCalls).toBe(2);
    expect(bucket.remove).toHaveBeenCalledWith([openObjectPath]);
    expect(bucket.upload).toHaveBeenCalledWith(
      OBJECT_PATH,
      expect.any(Buffer),
      expect.objectContaining({ upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_verification_upload_cleanup",
      expect.objectContaining({ p_intent_id: openIntentId }),
    );
  });

  it("fails closed and cleans up when downloaded bytes do not match", async () => {
    const differentBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x01]);
    const { bucket } = mockClient(async (name, args) => {
      if (name === "get_verification_upload_policy") return { data: policy, error: null };
      if (name === "create_verification_upload_intent") {
        return {
          data: {
            byte_size: JPEG_BYTES.byteLength,
            document_id: DOCUMENT_ID,
            expires_at: "2099-08-15T00:15:00Z",
            id: intentIdFrom(args),
            media_type: "image/jpeg",
            object_path: OBJECT_PATH,
            record_id: "32000000-0000-4000-8000-000000000001",
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "prepare_verification_upload_cleanup") {
        return {
          data: {
            id: intentIdFrom(args),
            object_path: OBJECT_PATH,
            status: "cleanup_pending",
          },
          error: null,
        };
      }
      if (name === "finalize_verification_upload_cleanup") {
        return {
          data: { id: intentIdFrom(args), status: "cleaned" },
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    }, differentBytes);

    await expect(
      submitVerificationEvidence({ status: "idle" }, uploadForm()),
    ).resolves.toEqual({ error: "upload_failed", status: "error" });
    expect(bucket.remove).toHaveBeenCalledWith([OBJECT_PATH]);
  });

  it("schedules early deletion without exposing or removing the object", async () => {
    const { bucket } = mockClient(async (name) => {
      expect(name).toBe("request_verification_document_deletion");
      return {
        data: {
          document_id: DOCUMENT_ID,
          eligible: false,
          retention_until: "2099-09-14T00:00:00Z",
          status: "scheduled",
        },
        error: null,
      };
    });
    const data = new FormData();
    data.set("documentId", DOCUMENT_ID);

    await expect(
      requestVerificationEvidenceDeletion({ status: "idle" }, data),
    ).resolves.toEqual({
      result: "scheduled",
      retentionUntil: "2099-09-14T00:00:00Z",
      status: "success",
    });
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("removes eligible bytes and records verified deletion", async () => {
    const { bucket, rpc } = mockClient(async (name) => {
      if (name === "request_verification_document_deletion") {
        return {
          data: {
            document_id: DOCUMENT_ID,
            eligible: true,
            object_path: OBJECT_PATH,
            retention_until: "2026-08-14T00:00:00Z",
            status: "eligible",
          },
          error: null,
        };
      }
      if (name === "finalize_verification_document_deletion") {
        return { data: { document_id: DOCUMENT_ID, status: "deleted" }, error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    });
    const data = new FormData();
    data.set("documentId", DOCUMENT_ID);

    await expect(
      requestVerificationEvidenceDeletion({ status: "idle" }, data),
    ).resolves.toEqual({ result: "deleted", status: "success" });
    expect(bucket.remove).toHaveBeenCalledWith([OBJECT_PATH]);
    expect(rpc).toHaveBeenCalledWith(
      "finalize_verification_document_deletion",
      expect.objectContaining({ p_document_id: DOCUMENT_ID }),
    );
  });
});
