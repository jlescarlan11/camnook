import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));
vi.mock("@/lib/auth/require-user", () => ({
  getAuthenticatedUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthenticatedUser, requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { saveProfile } from "./profile";
import { quoteBooking } from "./quote-booking";
import { requestBooking } from "./request-booking";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

function rpcClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc, schema: vi.fn(() => ({ rpc })) };
}

function profileQuery(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, eq, from, maybeSingle, select };
}

describe("quoteBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only normalized instants and camera ID to the authoritative quote RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          billable_days: 7,
          camera_id: CAMERA_ID,
          currency: "PHP",
          daily_rate: 1234.56,
          pickup_at: "2099-08-14T01:00:00+00:00",
          rental_amount: 77.77,
          return_at: "2099-08-15T01:01:00+00:00",
          security_deposit: 88.88,
          total_due: 99.99,
        },
      ],
      error: null,
    });
    const api = rpcClient(rpc);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(api as never);

    await expect(
      quoteBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          generation: "7",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:01",
        }),
      ),
    ).resolves.toEqual({
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:01"]',
      quote: {
        billableDays: 7,
        cameraId: CAMERA_ID,
        currency: "PHP",
        dailyRate: 1234.56,
        pickupAt: "2099-08-14T01:00:00+00:00",
        rentalAmount: 77.77,
        returnAt: "2099-08-15T01:01:00+00:00",
        securityDeposit: 88.88,
        totalDue: 99.99,
      },
      status: "success",
      submissionGeneration: 7,
      values: {
        camera: CAMERA_ID,
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:01",
      },
    });
    expect(rpc).toHaveBeenCalledWith("quote_booking", {
      p_camera_id: CAMERA_ID,
      p_pickup_at: "2099-08-14T09:00:00+08:00",
      p_return_at: "2099-08-15T09:01:00+08:00",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
  });

  it("rejects invalid input before creating a database client", async () => {
    await expect(
      quoteBooking(
        { status: "idle" },
        fields({ camera: "not-a-uuid", pickup: "", return: "bad" }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        camera: "Choose a camera.",
        pickup: "Enter a pickup date and time.",
        return: "Enter a valid return date and time.",
      },
      status: "error",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "22023", message: "private camera details" }, "not_quotable"],
    [{ code: "08006", message: "database hostname" }, "retryable"],
  ] as const)("maps database failures to %s without exposing details", async (dbError, category) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: dbError });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(rpcClient(rpc) as never);

    const result = await quoteBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toMatchObject({ error: category, status: "error" });
    expect(JSON.stringify(result)).not.toContain(dbError.message);
  });
});

describe("saveProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trims valid owner profile fields and sends only the two RPC parameters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { account_status: "active" }, error: null });
    const existing = profileQuery({ data: null, error: null });
    const api = rpcClient(rpc);
    const supabase = { ...existing.client, ...api } as never;
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);

    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "  Maria Santos  ", phone: "  +63 917 123 4567  " }),
      ),
    ).resolves.toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("ensure_profile", {
      p_legal_name: "Maria Santos",
      p_phone: "+63 917 123 4567",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/account");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/account/bookings/new");
  });

  it("rejects invalid fields before authentication or mutation", async () => {
    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "x", phone: "123" }),
      ),
    ).resolves.toMatchObject({
      fieldErrors: {
        legalName: "Enter your legal name (2–160 characters).",
        phone: "Enter a phone number (7–32 characters).",
      },
      status: "error",
      values: { legalName: "x", phone: "123" },
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("fails closed for a suspended owner without calling ensure_profile", async () => {
    const rpc = vi.fn();
    const existing = profileQuery({
      data: { account_status: "suspended" },
      error: null,
    });
    const supabase = { ...existing.client, ...rpcClient(rpc) } as never;
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);

    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "Maria Santos", phone: "+63 917 123 4567" }),
      ),
    ).resolves.toMatchObject({ error: "suspended", status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["lookup", { data: null, error: { code: "08006", message: "profile relation secret" } }],
    ["mutation", { data: null, error: { code: "XX000", message: "ensure_profile internals" } }],
  ] as const)("constrains a profile %s failure without leaking provider details", async (stage, failure) => {
    const rpc = vi.fn().mockResolvedValue(
      stage === "mutation" ? failure : { data: { account_status: "active" }, error: null },
    );
    const existing = profileQuery(
      stage === "lookup" ? failure : { data: null, error: null },
    );
    const supabase = { ...existing.client, ...rpcClient(rpc) } as never;
    vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);

    const result = await saveProfile(
      { status: "idle" },
      fields({ legalName: "Maria Santos", phone: "+63 917 123 4567" }),
    );

    expect(result).toEqual({
      error: "save_failed",
      status: "error",
      values: {
        legalName: "Maria Santos",
        phone: "+63 917 123 4567",
      },
    });
    expect(JSON.stringify(result)).not.toContain(failure.error.message);
    if (stage === "lookup") expect(rpc).not.toHaveBeenCalled();
  });
});

describe("requestBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends exactly five renter-entered parameters then revalidates and redirects", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: BOOKING_ID, error: null });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    const api = rpcClient(rpc);
    const supabase = { ...active.client, ...api } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "  Quezon City  ",
          intendedUse: "  Family event  ",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
          renterId: "attacker",
          totalDue: "1",
          state: "CONFIRMED",
        }),
      ),
    ).rejects.toThrow(`redirect:/account/bookings/${BOOKING_ID}?requested=1`);
    expect(rpc).toHaveBeenCalledWith("request_booking", {
      p_camera_id: CAMERA_ID,
      p_expected_location: "Quezon City",
      p_intended_use: "Family event",
      p_pickup_at: "2099-08-14T09:00:00+08:00",
      p_return_at: "2099-08-15T09:00:00+08:00",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/account");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/account/bookings/${BOOKING_ID}?requested=1`,
    );
  });

  it("returns field errors without authenticating or mutating invalid input", async () => {
    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: "bad",
          expectedLocation: "x",
          intendedUse: "",
          pickup: "",
          return: "",
        }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        camera: "Choose a camera.",
        expectedLocation: "Describe the expected location (2–500 characters).",
        intendedUse: "Describe the intended use (2–1000 characters).",
        pickup: "Enter a pickup date and time.",
        return: "Enter a return date and time.",
      },
      status: "error",
      values: { expectedLocation: "x", intendedUse: "" },
    });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("routes an unauthenticated direct action call through invite-only login", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Quezon City",
          intendedUse: "Family event",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
        }),
      ),
    ).rejects.toThrow("redirect:/login?next=");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      "/login?next=%2Faccount%2Fbookings%2Fnew%3Fcamera%3D11111111-1111-4111-8111-111111111111%26pickup%3D2099-08-14T09%253A00%26return%3D2099-08-15T09%253A00",
    );
  });

  it.each([
    [null, "profile_required"],
    [{ account_status: "suspended" }, "suspended"],
  ] as const)("blocks a missing or suspended profile %#", async (profile, error) => {
    const query = profileQuery({ data: profile, error: null });
    const rpc = vi.fn();
    const supabase = { ...query.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Quezon City",
          intendedUse: "Family event",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
        }),
      ),
    ).resolves.toMatchObject({ error, status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("constrains persistence failures without revealing provider details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23503", message: "secret table and renter id" },
    });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    const supabase = { ...active.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    const result = await requestBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toMatchObject({
      error: "request_failed",
      status: "error",
      values: {
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret table");
  });

  it("fails closed when the profile prerequisite query fails", async () => {
    const query = profileQuery({
      data: null,
      error: { code: "08006", message: "profile table details" },
    });
    const rpc = vi.fn();
    const supabase = { ...query.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    const result = await requestBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toEqual({
      error: "request_failed",
      status: "error",
      values: {
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
      },
    });
    expect(JSON.stringify(result)).not.toContain("profile table details");
    expect(rpc).not.toHaveBeenCalled();
  });
});
