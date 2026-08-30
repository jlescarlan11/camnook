import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  return {
    isAuthenticationError: (error: unknown) =>
      error instanceof Error && error.name === "AuthenticationRequiredError",
  };
});
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import { supersedeContract } from "./admin-actions";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function validForm() {
  const data = new FormData();
  data.set("bookingId", BOOKING_ID);
  data.set("camera", CAMERA_ID);
  data.set("pickup", "2099-08-15T09:00");
  data.set("return", "2099-08-16T09:00");
  return data;
}

function authenticate(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: "admin" },
  } as never);
  return rpc;
}

describe("supersedeContract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the proposed identity and Manila period before authorization", async () => {
    const form = validForm();
    form.set("camera", "invalid");

    await expect(
      supersedeContract({ status: "idle" }, form),
    ).resolves.toMatchObject({ error: "invalid_input", status: "error" });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated direct action before mutation", async () => {
    vi.mocked(requireUser).mockRejectedValue(
      Object.assign(new Error(), { name: "AuthenticationRequiredError" }),
    );

    await expect(
      supersedeContract({ status: "idle" }, validForm()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
  });

  it("sends only the material selection and revalidates renter/admin views", async () => {
    const rpc = authenticate({ data: VERSION_ID, error: null });

    await expect(
      supersedeContract({ status: "idle" }, validForm()),
    ).resolves.toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("supersede_contract", {
      p_booking_id: BOOKING_ID,
      p_camera_id: CAMERA_ID,
      p_pickup_at: "2099-08-15T09:00:00+08:00",
      p_return_at: "2099-08-16T09:00:00+08:00",
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/account/bookings/${BOOKING_ID}`,
    );
  });

  it.each([
    ["42501", "contract_supersession_unauthorized", "unauthorized", "error"],
    ["22023", "contract_no_material_change", "no_change", "error"],
    ["23P01", "contract_availability_conflict", "availability", "stale"],
    ["40001", "contract_version_stale", "stale", "stale"],
  ])("constrains replacement failure %s/%s", async (code, message, error, status) => {
    authenticate({ data: null, error: { code, details: "private", message } });

    const result = await supersedeContract({ status: "idle" }, validForm());

    expect(result).toEqual({ error, status });
    expect(JSON.stringify(result)).not.toMatch(/private|contract_/);
  });

  it("treats a malformed success response as indeterminate and refreshes", async () => {
    authenticate({ data: null, error: null });

    await expect(
      supersedeContract({ status: "idle" }, validForm()),
    ).resolves.toEqual({ error: "unknown", status: "indeterminate" });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });
});

const VERSION_ID = "33333333-3333-4333-8333-333333333333";
