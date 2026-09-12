import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runResidentialProductionSmoke } from "./production-smoke";

const saved = {
  address_details: "Synthetic public fixture",
  address_revision: "18bf71c2-c83f-46d5-b312-0687706f49e8",
  area_code: "0730600041",
  building: "Release Automation",
  house_number: "12",
  postal_code: "6000",
  release: "2026-q2",
  residential_pin: { source: "map_pin" },
  street_name: "Mango Avenue",
};

describe("residential Production smoke", () => {
  it("provisions a synthetic actor and verifies set/read/remove/read", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "smoke-user" } },
      error: null,
    });
    const generateLink = vi.fn().mockResolvedValue({
      data: { user: { id: "smoke-user" }, properties: { hashed_token: "single-use-token" } },
      error: null,
    });
    const admin = { auth: { admin: { createUser, generateLink } } };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: saved, error: null })
      .mockResolvedValueOnce({ data: saved, error: null })
      .mockResolvedValueOnce({ data: { ...saved, residential_pin: null }, error: null })
      .mockResolvedValueOnce({ data: { ...saved, residential_pin: null }, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const actor = {
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({
          data: { user: { id: "smoke-user" } },
          error: null,
        }),
        signOut,
      },
      schema: vi.fn(() => ({ rpc })),
    };

    await runResidentialProductionSmoke({
      createActorClient: () => actor as never,
      createAdminClient: () => admin as never,
    });

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "residential-release-smoke@camnook.invalid",
      email_confirm: true,
    }));
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "residential-release-smoke@camnook.invalid" });
    expect(actor.auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "single-use-token" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_my_kyc_profile_v2",
      "save_my_kyc_profile_v2",
      "get_my_kyc_profile_v2",
      "save_my_kyc_profile_v2",
      "get_my_kyc_profile_v2",
    ]);
    expect(rpc.mock.calls[1][1].p_input).toMatchObject({
      pin_consent_version: "residential-pin-v1",
      pin_operation: "set",
    });
    expect(rpc.mock.calls[3][1].p_input.pin_operation).toBe("remove");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
