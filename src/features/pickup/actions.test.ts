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
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  completePickup,
  requestAdminConditionPhotoAccess,
  requestMyConditionPhotoAccess,
  uploadConditionPhoto,
} from "./actions";

const BOOKING_ID = "83000000-0000-4000-8000-000000000001";
const OPERATION_ID = "83000000-0000-4000-8000-000000000002";
const ACCESSORY_ID = "83000000-0000-4000-8000-000000000003";
const HANDOFF_ID = "83000000-0000-4000-8000-000000000004";
const REPORT_ID = "83000000-0000-4000-8000-000000000005";
const PHOTO_ID = "83000000-0000-4000-8000-000000000006";
const INTENT_ID = "83000000-0000-4000-8000-000000000007";

function completionForm() {
  const data = new FormData();
  data.set("actualAt", "2026-08-16T10:00");
  data.set("bookingId", BOOKING_ID);
  data.set("cameraSerial", "OBSERVED-SERIAL");
  data.set("conditionSummary", "Clean and functional.");
  data.set("namedRenter", "confirmed-named-renter");
  data.set("notes", "");
  data.set("operationId", OPERATION_ID);
  data.set("originalIdChecked", "confirmed-original-id");
  data.set("originalIdMatched", "confirmed-id-match");
  data.append("accessoryId", ACCESSORY_ID);
  return data;
}

function authorizeAdmin(rpc: ReturnType<typeof vi.fn>, storage?: unknown) {
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: {
      schema: vi.fn(() => ({ rpc })),
      storage: storage ?? { from: vi.fn() },
    },
    user: { id: "admin" },
  } as never);
}

function authenticatePickup(rpc: ReturnType<typeof vi.fn>) {
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: "admin" },
  } as never);
}

describe("pickup Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires every physical checklist fact before authorization", async () => {
    const data = completionForm();
    data.delete("originalIdMatched");

    const result = await completePickup({ status: "idle" }, data);

    expect(result).toMatchObject({ error: "invalid", status: "error" });
    expect(result.fieldErrors?.originalId).toContain("matches");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("keeps an invalid private note attached to its own pickup field", async () => {
    const data = completionForm();
    data.set("notes", "x".repeat(2001));

    const result = await completePickup({ status: "idle" }, data);

    expect(result).toMatchObject({ error: "invalid", status: "error" });
    expect(result.fieldErrors?.notes).toContain("Notes");
    expect(result.fieldErrors?.conditionSummary).toBeUndefined();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("submits only observed facts to the atomic pickup RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking_id: BOOKING_ID,
        booking_state: "ACTIVE",
        condition_report_id: REPORT_ID,
        created: true,
        handoff_id: HANDOFF_ID,
      },
      error: null,
    });
    authenticatePickup(rpc);

    await expect(
      completePickup({ status: "idle" }, completionForm()),
    ).resolves.toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("complete_pickup", {
      p_accessory_ids: [ACCESSORY_ID],
      p_actual_at: "2026-08-16T10:00:00+08:00",
      p_booking_id: BOOKING_ID,
      p_camera_serial: "OBSERVED-SERIAL",
      p_condition_summary: "Clean and functional.",
      p_named_renter_present: true,
      p_notes: "",
      p_operation_id: OPERATION_ID,
      p_original_id_checked: true,
      p_original_id_matched: true,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/payment|verification_record|contract_version/);
    expect(revalidatePath).toHaveBeenCalledWith(`/account/bookings/${BOOKING_ID}`);
  });

  it("denies unauthenticated pickup and maps the mutation admin guard", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(
      Object.assign(new Error(), { name: "AuthenticationRequiredError" }),
    );
    await expect(
      completePickup({ status: "idle" }, completionForm()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });

    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "admin authorization required" },
    });
    authenticatePickup(rpc);
    await expect(
      completePickup({ status: "idle" }, completionForm()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uploads an exact no-overwrite photo, verifies bytes, then finalizes", async () => {
    const objectPath = `${BOOKING_ID}/${REPORT_ID}/${PHOTO_ID}.png`;
    let claimedIntentId = "";
    const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "create_condition_photo_upload_intent") {
        claimedIntentId = String(input.p_intent_id);
        return {
          data: {
            booking_id: BOOKING_ID,
            byte_size: 9,
            condition_report_id: REPORT_ID,
            expires_at: "2026-08-16T03:00:00Z",
            id: claimedIntentId,
            media_type: "image/png",
            object_path: objectPath,
            photo_id: PHOTO_ID,
            status: "awaiting_upload",
          },
          error: null,
        };
      }
      if (name === "finalize_condition_photo_upload") {
        return {
          data: {
            booking_id: BOOKING_ID,
            condition_report_id: REPORT_ID,
            created: true,
            photo_id: PHOTO_ID,
            status: "finalized",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
    authorizeAdmin(rpc, { from: vi.fn(() => ({ upload })) });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const download = vi.fn().mockResolvedValue({
      data: new Blob([bytes], { type: "image/png" }),
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ download })) },
    } as never);
    const data = new FormData();
    data.set("bookingId", BOOKING_ID);
    data.set("conditionReportId", REPORT_ID);
    data.set("intentId", INTENT_ID);
    data.set("photo", new File([bytes], "condition.png", { type: "image/png" }));

    await expect(
      uploadConditionPhoto({ status: "idle" }, data),
    ).resolves.toMatchObject({ result: "saved", status: "success" });
    expect(upload).toHaveBeenCalledWith(
      objectPath,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_condition_photo_upload_intent",
      expect.objectContaining({ p_intent_id: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_condition_photo_upload",
      expect.objectContaining({
        p_intent_id: claimedIntentId,
        p_verified_byte_size: 9,
        p_verified_media_type: "image/png",
        p_verified_sha256_hex: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("reconciles a finalized stable photo intent after a lost response", async () => {
    const objectPath = `${BOOKING_ID}/${REPORT_ID}/${PHOTO_ID}.png`;
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    let persistedIntentId = "";
    const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "create_condition_photo_upload_intent") {
        persistedIntentId = String(input.p_intent_id);
        return { data: null, error: { code: "23505" } };
      }
      if (name === "get_condition_photo_upload_intent") {
        return {
          data: {
            booking_id: BOOKING_ID,
            byte_size: 9,
            condition_report_id: REPORT_ID,
            expires_at: "2026-08-16T03:00:00Z",
            id: persistedIntentId,
            media_type: "image/png",
            object_path: objectPath,
            photo_id: PHOTO_ID,
            status: "finalized",
          },
          error: null,
        };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
    const upload = vi.fn();
    authorizeAdmin(rpc, { from: vi.fn(() => ({ upload })) });
    const download = vi.fn().mockResolvedValue({
      data: new Blob([bytes], { type: "image/png" }),
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ download })) },
    } as never);
    const data = new FormData();
    data.set("bookingId", BOOKING_ID);
    data.set("conditionReportId", REPORT_ID);
    data.set("intentId", INTENT_ID);
    data.set("photo", new File([bytes], "condition.png", { type: "image/png" }));

    await expect(
      uploadConditionPhoto({ status: "idle" }, data),
    ).resolves.toMatchObject({ result: "saved", status: "success" });
    expect(upload).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith(objectPath);

    download.mockResolvedValueOnce({
      data: new Blob(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
        { type: "image/png" },
      ),
      error: null,
    });
    await expect(
      uploadConditionPhoto({ status: "idle" }, data),
    ).resolves.toEqual({ error: "unavailable", status: "error" });
  });

  it("uses purpose-bound database grants before short-lived admin and owner URLs", async () => {
    const grant = {
      booking_id: BOOKING_ID,
      condition_report_id: REPORT_ID,
      expires_in_seconds: 60,
      object_path: `${BOOKING_ID}/${REPORT_ID}/${PHOTO_ID}.png`,
      photo_id: PHOTO_ID,
    };
    const adminRpc = vi.fn().mockResolvedValue({ data: grant, error: null });
    const ownerRpc = vi.fn().mockResolvedValue({ data: grant, error: null });
    authorizeAdmin(adminRpc);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc: ownerRpc })) },
      user: { id: "owner" },
    } as never);
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed-condition" },
      error: null,
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as never);
    const data = new FormData();
    data.set("bookingId", BOOKING_ID);
    data.set("photoId", PHOTO_ID);

    await expect(
      requestAdminConditionPhotoAccess({ status: "idle" }, data),
    ).resolves.toMatchObject({ signedUrl: expect.any(String), status: "success" });
    await expect(
      requestMyConditionPhotoAccess({ status: "idle" }, data),
    ).resolves.toMatchObject({ signedUrl: expect.any(String), status: "success" });
    expect(adminRpc).toHaveBeenCalledWith("authorize_condition_photo_access", {
      p_operation_id: expect.any(String),
      p_photo_id: PHOTO_ID,
      p_purpose: "pickup_condition_review",
    });
    expect(ownerRpc).toHaveBeenCalledWith(
      "authorize_my_condition_photo_access",
      { p_booking_id: BOOKING_ID, p_photo_id: PHOTO_ID },
    );
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUrl).toHaveBeenCalledWith(grant.object_path, 60);
  });
});
