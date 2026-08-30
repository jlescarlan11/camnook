import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { submitPayment, uploadPaymentProof } from "./actions";

const BOOKING_ID = "72000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "72000000-0000-4000-8000-000000000002";
const PAYMENT_ID = "72000000-0000-4000-8000-000000000003";

function submissionForm() {
  const data = new FormData();
  data.set("attemptId", ATTEMPT_ID);
  data.set("bookingId", BOOKING_ID);
  data.set("reference", "GCASH REFERENCE");
  data.set(
    "proof",
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "receipt.jpg", {
      type: "image/jpeg",
    }),
  );
  return data;
}

function authorize(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: {
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn() },
    },
    user: { id: "owner" },
  } as never);
  return rpc;
}

describe("payment owner actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid reference or missing proof before authentication", async () => {
    const data = submissionForm();
    data.set("reference", "<script>");
    data.delete("proof");

    const result = await submitPayment({ status: "idle" }, data);

    expect(result).toMatchObject({ error: "invalid", status: "error" });
    expect(result.fieldErrors).toMatchObject({
      proof: expect.any(String),
      reference: expect.any(String),
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("submits only the reference and stable identifiers before proof persistence", async () => {
    const rpc = authorize({
      data: {
        booking_state: "PAYMENT_REVIEW",
        created: true,
        status: "submitted",
        transaction_id: PAYMENT_ID,
      },
      error: null,
    });

    await expect(
      submitPayment({ status: "idle" }, submissionForm()),
    ).resolves.toEqual({
      error: "proof_failed",
      status: "error",
      transactionId: PAYMENT_ID,
    });
    expect(rpc).toHaveBeenCalledWith("submit_payment", {
      p_attempt_id: ATTEMPT_ID,
      p_booking_id: BOOKING_ID,
      p_reference: "GCASH REFERENCE",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/account/bookings/${BOOKING_ID}`,
    );
  });

  it("returns a safe fail-closed error without provider details", async () => {
    authorize({
      data: null,
      error: { code: "55000", message: "private contract/config detail" },
    });

    const result = await submitPayment(
      { status: "idle" },
      submissionForm(),
    );

    expect(result).toEqual({
      error: "recipient_unavailable",
      status: "error",
    });
    expect(JSON.stringify(result)).not.toMatch(/private|contract\/config/);
  });

  it("requires a non-empty proof when using the correction action", async () => {
    const data = new FormData();
    data.set("bookingId", BOOKING_ID);
    data.set("transactionId", PAYMENT_ID);

    await expect(
      uploadPaymentProof({ status: "idle" }, data),
    ).resolves.toMatchObject({ error: "invalid", status: "error" });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("reconciles an immutable proof left by an interrupted upload retry", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const proof = new File([bytes], "receipt.jpg", { type: "image/jpeg" });
    const userRpc = vi.fn().mockResolvedValue({
      data: {
        allowed_media_types: ["image/jpeg", "image/png"],
        max_byte_size: 5 * 1024 * 1024,
        upload_intent_seconds: 900,
      },
      error: null,
    });
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "The resource already exists" },
    });
    const remove = vi.fn();
    vi.mocked(requireUser).mockResolvedValue({
      supabase: {
        schema: vi.fn(() => ({ rpc: userRpc })),
        storage: { from: vi.fn(() => ({ remove, upload })) },
      },
      user: { id: "owner" },
    } as never);

    const adminRpc = vi.fn(async (name: string) => {
      if (name === "create_payment_proof_upload_intent") {
        return {
          data: {
            id: ATTEMPT_ID,
            object_path: `${ATTEMPT_ID}/proof.jpg`,
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "finalize_payment_proof_upload") {
        return { data: { status: "finalized" }, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const download = vi.fn().mockResolvedValue({
      data: new Blob([bytes], { type: "image/jpeg" }),
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc: adminRpc })),
      storage: { from: vi.fn(() => ({ download })) },
    } as never);

    const data = new FormData();
    data.set("bookingId", BOOKING_ID);
    data.set("transactionId", PAYMENT_ID);
    data.set("proof", proof);

    await expect(
      uploadPaymentProof({ status: "idle" }, data),
    ).resolves.toEqual({
      result: "proof_saved",
      status: "success",
      transactionId: PAYMENT_ID,
    });
    expect(upload).toHaveBeenCalledWith(
      `${ATTEMPT_ID}/proof.jpg`,
      expect.any(Buffer),
      expect.objectContaining({ upsert: false }),
    );
    expect(download).toHaveBeenCalledWith(`${ATTEMPT_ID}/proof.jpg`);
    expect(adminRpc).toHaveBeenCalledWith(
      "finalize_payment_proof_upload",
      expect.objectContaining({ p_intent_id: ATTEMPT_ID }),
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
