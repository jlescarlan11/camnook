import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadVerificationReviewDetail,
  loadVerificationReviewQueue,
} from "./admin-data";

const RECORD_ID = "41000000-0000-4000-8000-000000000001";

function contextWith(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  return {
    context: { supabase: { schema }, user: { id: "admin" } } as never,
    rpc,
    schema,
  };
}

describe("admin verification review data", () => {
  it("loads the database-ordered, metadata-only queue", async () => {
    const api = contextWith({
      data: [
        {
          age_seconds: 7200,
          id_type: "philippine_passport",
          record_id: RECORD_ID,
          renter_legal_name: "Synthetic Renter",
          submitted_at: "2026-08-15T00:00:00Z",
        },
      ],
      error: null,
    });

    const loaded = await loadVerificationReviewQueue(api.context);

    expect(loaded.status).toBe("success");
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(api.rpc).toHaveBeenCalledWith("get_verification_review_queue");
    expect(JSON.stringify(loaded)).not.toMatch(
      /object_path|sha256|phone|verification-documents/,
    );
  });

  it("rejects unexpected private fields instead of stripping them", async () => {
    const api = contextWith({
      data: [
        {
          age_seconds: 1,
          id_type: "umid",
          object_path: "private/path",
          record_id: RECORD_ID,
          renter_legal_name: "Synthetic Renter",
          submitted_at: "2026-08-15T00:00:00Z",
        },
      ],
      error: null,
    });

    await expect(loadVerificationReviewQueue(api.context)).resolves.toEqual({
      status: "error",
    });
  });

  it("validates a detail reference before querying and maps stale records to missing", async () => {
    const invalid = contextWith({ data: null, error: null });
    await expect(
      loadVerificationReviewDetail(invalid.context, "invalid"),
    ).resolves.toEqual({ status: "missing" });
    expect(invalid.rpc).not.toHaveBeenCalled();

    const missing = contextWith({
      data: null,
      error: { code: "P0002", message: "private detail" },
    });
    await expect(
      loadVerificationReviewDetail(missing.context, RECORD_ID),
    ).resolves.toEqual({ status: "missing" });
  });

  it("returns only the strict review detail contract", async () => {
    const api = contextWith({
      data: {
        byte_size: 1024,
        id_type: "drivers_license",
        media_type: "image/png",
        record_id: RECORD_ID,
        renter_legal_name: "Synthetic Renter",
        retention_until: "2026-09-14T00:00:00Z",
        status: "pending",
        submitted_at: "2026-08-15T00:00:00Z",
      },
      error: null,
    });

    const loaded = await loadVerificationReviewDetail(api.context, RECORD_ID);

    expect(loaded.status).toBe("success");
    expect(api.rpc).toHaveBeenCalledWith("get_verification_review_detail", {
      p_record_id: RECORD_ID,
    });
    expect(JSON.stringify(loaded)).not.toMatch(/object_path|sha256|phone/);
  });
});
