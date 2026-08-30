import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  class AdminAuthorizationRequiredError extends Error {}
  return {
    AdminAuthorizationRequiredError,
    isAuthenticationError: (error: unknown) =>
      error instanceof Error && error.name === "AuthenticationRequiredError",
    requireAdmin: vi.fn(),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import {
  AdminAuthorizationRequiredError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  configureGcashRecipient,
  decidePayment,
  requestPaymentProofAccess,
} from "./admin-actions";

const PAYMENT_ID = "73000000-0000-4000-8000-000000000001";
const PROOF_ID = "73000000-0000-4000-8000-000000000002";
const ADMIN_ID = "73000000-0000-4000-8000-000000000003";

function verifyForm() {
  const data = new FormData();
  data.set("actualAccount", "confirmed-actual-account");
  data.set("decision", "verified");
  data.set("observedAmount", "6000.00");
  data.set("observedReference", "GCASH REFERENCE");
  data.set("paymentId", PAYMENT_ID);
  return data;
}

function authorize(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: ADMIN_ID },
  } as never);
  return rpc;
}

describe("payment admin actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates a validated GCash recipient without accepting an enable toggle", async () => {
    const rpc = authorize({ data: { enabled: true, version: 4 }, error: null });
    const data = new FormData();
    data.set("recipientAccount", "09171234567");
    data.set("recipientName", "CamNook Recipient");
    data.set("enabled", "false");

    await expect(
      configureGcashRecipient({ status: "idle" }, data),
    ).resolves.toEqual({ status: "success", version: 4 });
    expect(rpc).toHaveBeenCalledWith("configure_gcash_recipient", {
      p_enabled: true,
      p_operation_id: expect.any(String),
      p_recipient_account: "09171234567",
      p_recipient_name: "CamNook Recipient",
    });
  });

  it("requires explicit actual-account confirmation before authorization", async () => {
    const data = verifyForm();
    data.delete("actualAccount");

    const result = await decidePayment({ status: "idle" }, data);

    expect(result).toMatchObject({ action: "verify", status: "error" });
    expect(result.fieldErrors?.actualAccount).toContain("not from the screenshot");
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("rechecks sole-admin authorization inside every decision", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new AdminAuthorizationRequiredError(),
    );

    await expect(
      decidePayment({ status: "idle" }, verifyForm()),
    ).resolves.toEqual({
      action: "verify",
      error: "unauthorized",
      status: "error",
    });
  });

  it("sends observed account facts and never client-supplied allocations", async () => {
    const rpc = authorize({
      data: {
        booking_state: "CONFIRMED",
        created: true,
        status: "verified",
        transaction_id: PAYMENT_ID,
      },
      error: null,
    });

    await expect(
      decidePayment({ status: "idle" }, verifyForm()),
    ).resolves.toMatchObject({
      action: "verify",
      bookingState: "CONFIRMED",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("verify_payment", {
      p_actual_account_checked: true,
      p_observed_amount: 6000,
      p_observed_reference: "GCASH REFERENCE",
      p_operation_id: expect.any(String),
      p_payment_id: PAYMENT_ID,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/allocation|proof|path/);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("issues a signed URL only after the purpose-bound database grant", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: { schema: vi.fn() },
      user: { id: ADMIN_ID },
    } as never);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        expires_in_seconds: 60,
        object_path: "opaque/private-proof.png",
        proof_id: PROOF_ID,
        transaction_id: PAYMENT_ID,
      },
      error: null,
    });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed-proof" },
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as never);
    const data = new FormData();
    data.set("paymentId", PAYMENT_ID);

    const result = await requestPaymentProofAccess(
      { status: "idle" },
      data,
    );

    expect(result).toMatchObject({
      signedUrl: "https://example.supabase.co/signed-proof",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("authorize_payment_proof_access", {
      p_actor_user_id: ADMIN_ID,
      p_operation_id: expect.any(String),
      p_payment_id: PAYMENT_ID,
      p_purpose: "payment_reconciliation",
    });
    expect(createSignedUrl).toHaveBeenCalledWith(
      "opaque/private-proof.png",
      60,
    );
  });
});
