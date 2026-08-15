import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadVerificationState } from "./data";

const validState = {
  document: null,
  documents: [],
  intent: null,
  policy: {
    allowed_id_types: ["philippine_passport"],
    allowed_media_types: ["image/jpeg"],
    document_retention_days: 30,
    enabled: true,
    max_byte_size: 5 * 1024 * 1024,
    policy_version: "government-id-evidence-v2",
    privacy_notice_version: "government-id-privacy-v2",
    upload_intent_seconds: 900,
  },
  record: null,
};

describe("renter verification projection", () => {
  it("uses the safe account-state RPC instead of selecting private metadata", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: validState, error: null });
    const client = { schema: vi.fn(() => ({ rpc })) };

    await expect(
      loadVerificationState({ supabase: client as never, user: { id: "user-1" } } as never),
    ).resolves.toEqual({ state: validState, status: "success" });
    expect(client.schema).toHaveBeenCalledWith("api");
    expect(rpc).toHaveBeenCalledWith("get_my_verification_upload_state");
    expect(JSON.stringify(validState)).not.toContain("object_path");
    expect(JSON.stringify(validState)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("fails closed for provider errors or an unsafe response shape", async () => {
    for (const result of [
      { data: null, error: { message: "private provider details" } },
      { data: { ...validState, object_path: "/private/path" }, error: null },
    ]) {
      const rpc = vi.fn().mockResolvedValue(result);
      const client = { schema: vi.fn(() => ({ rpc })) };
      const loaded = await loadVerificationState({
        supabase: client as never,
        user: { id: "user-1" },
      } as never);
      if (result.error) {
        expect(loaded).toEqual({ status: "error" });
        expect(JSON.stringify(loaded)).not.toContain("private provider details");
      } else {
        // Zod strips unknown top-level fields before data reaches the account page.
        expect(loaded).toEqual({ state: validState, status: "success" });
      }
    }
  });
});
