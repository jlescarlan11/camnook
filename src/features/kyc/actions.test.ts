import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";

import { saveKycProfile } from "./actions";

function fields(overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    addressLine1: "Unit 4, 123 Mango Avenue",
    birthDate: "1990-03-15",
    legalName: "Maria Santos",
    phone: "+63 917 123 4567",
    psgcAreaCode: "0722170010",
    psgcRelease: "2026-q2",
    returnTo: "/account/bookings/new?camera=example",
    ...overrides,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("renter KYC action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves minimum KYC fields through the actor-owned RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "11111111-1111-4111-8111-111111111111" },
    } as never);

    await expect(saveKycProfile({ status: "idle" }, fields())).rejects.toThrow(
      "redirect:/account/bookings/new?camera=example",
    );
    expect(rpc).toHaveBeenCalledWith("save_my_kyc_profile", {
      p_input: {
        address_line1: "Unit 4, 123 Mango Avenue",
        area_code: "0722170010",
        birth_date: "1990-03-15",
        legal_name: "Maria Santos",
        phone: "+63 917 123 4567",
        release_key: "2026-q2",
      },
    });
  });

  it("rejects an underage renter before authentication or persistence", async () => {
    const nextYear = String(new Date().getUTCFullYear() - 17);
    await expect(saveKycProfile(
      { status: "idle" },
      fields({ birthDate: `${nextYear}-01-01` }),
    )).resolves.toMatchObject({ error: "underage", status: "error" });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("requires a canonical barangay selection", async () => {
    await expect(saveKycProfile(
      { status: "idle" },
      fields({ psgcAreaCode: "" }),
    )).resolves.toMatchObject({
      error: "invalid",
      fieldErrors: { psgcAreaCode: expect.any(String) },
    });
    expect(requireUser).not.toHaveBeenCalled();
  });
});
