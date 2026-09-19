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
    addressDetails: "Near community hall",
    birthDate: "1990-03-15",
    building: "Mango Residences",
    expectedAddressRevision: "",
    houseNumber: "Unit 4",
    legalName: "Maria Santos",
    legacyAddressLine1: "",
    pinAccuracyMeters: "",
    pinLatitude: "",
    pinLongitude: "",
    pinOperation: "keep",
    pinSource: "",
    phone: "+63 917 123 4567",
    postalCode: "6000",
    psgcAreaCode: "0722170010",
    psgcRelease: "2026-q2",
    returnTo: "/checkout?camera=example",
    streetName: "123 Mango Avenue",
    ...overrides,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("renter KYC action", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["/checkout?camera=test&pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00&policyVersion=3", "/checkout?camera=test&pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00&policyVersion=3"],
    ["/account#default-address", "/account#default-address"],
    ["/account/bookings/new?camera=test", "/account/bookings/new?camera=test"],
    ["//evil.test/checkout", "/account"],
    ["/accounts", "/account"],
    ["/checkout?bad=%zz", "/account"],
  ])("returns KYC save safely from %s", async (returnTo, expected) => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(requireUser).mockResolvedValue({ supabase: { schema: () => ({ rpc }) }, user: { id: "renter" } } as never);
    await expect(saveKycProfile({ status: "idle" }, fields({ returnTo }))).rejects.toThrow(`redirect:${expected}`);
  });

  it("saves minimum KYC fields through the actor-owned RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "11111111-1111-4111-8111-111111111111" },
    } as never);

    await expect(saveKycProfile({ status: "idle" }, fields())).rejects.toThrow(
      "redirect:/checkout?camera=example",
    );
    expect(rpc).toHaveBeenCalledWith("save_my_kyc_profile_v2", {
      p_input: {
        address_details: "Near community hall",
        area_code: "0722170010",
        birth_date: "1990-03-15",
        building: "Mango Residences",
        expected_address_revision: null,
        house_number: "Unit 4",
        legacy_address_line1: null,
        legal_name: "Maria Santos",
        pin_accuracy_meters: null,
        pin_consent_version: null,
        pin_latitude: null,
        pin_longitude: null,
        pin_operation: "keep",
        pin_source: null,
        phone: "+63 917 123 4567",
        postal_code: "6000",
        release_key: "2026-q2",
        street_name: "123 Mango Avenue",
      },
    });
  });

  it("preserves an unsplit legacy address when no structured field is entered", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "11111111-1111-4111-8111-111111111111" },
    } as never);
    const data = fields({
      addressDetails: "", building: "", houseNumber: "",
      legacyAddressLine1: "Sitio Riverside, unnamed road",
      postalCode: "", streetName: "",
    });
    await expect(saveKycProfile({ status: "idle" }, data)).rejects.toThrow("redirect:");
    expect(rpc).toHaveBeenCalledWith("save_my_kyc_profile_v2", {
      p_input: expect.objectContaining({
        address_details: null,
        legacy_address_line1: "Sitio Riverside, unnamed road",
      }),
    });
  });

  it("validates a confirmed pin before authentication", async () => {
    await expect(saveKycProfile({ status: "idle" }, fields({
      pinLatitude: "NaN",
      pinLongitude: "123.90",
      pinOperation: "set",
      pinSource: "map_pin",
    }))).resolves.toMatchObject({
      error: "invalid",
      fieldErrors: { residentialPin: expect.any(String) },
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("rejects coordinate fields when the pin operation does not set a pin", async () => {
    await expect(saveKycProfile({ status: "idle" }, fields({
      pinLatitude: "10.31",
      pinLongitude: "123.89",
      pinOperation: "keep",
    }))).resolves.toMatchObject({
      error: "invalid",
      fieldErrors: { residentialPin: expect.any(String) },
    });
    expect(requireUser).not.toHaveBeenCalled();
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
