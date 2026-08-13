import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  class AdminAuthorizationRequiredError extends Error {}
  class AdminAuthorizationCheckError extends Error {}
  return {
    AdminAuthorizationCheckError,
    AdminAuthorizationRequiredError,
    isAuthenticationError: (error: unknown) =>
      error instanceof Error && error.name === "AuthenticationRequiredError",
    requireAdmin: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import {
  AdminAuthorizationCheckError,
  AdminAuthorizationRequiredError,
  requireAdmin,
} from "@/lib/auth/require-admin";

import { approveBooking, rejectBooking } from "./actions";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

function authorizeWithRpc(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema },
    user: { id: "admin-user" },
  } as never);
  return { rpc, schema };
}

describe("approveBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the booking UUID before authorizing or invoking the RPC", async () => {
    await expect(
      approveBooking({ status: "idle" }, fields({ bookingId: "invalid" })),
    ).resolves.toEqual({
      action: "approve",
      fieldErrors: { bookingId: "This booking reference is invalid." },
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error(), { name: "AuthenticationRequiredError" }),
    new AdminAuthorizationRequiredError(),
  ])("denies a direct unauthorized action without mutation", async (error) => {
    vi.mocked(requireAdmin).mockRejectedValue(error);

    const result = await approveBooking(
      { status: "idle" },
      fields({ bookingId: BOOKING_ID }),
    );

    expect(result).toEqual({
      action: "approve",
      category: "unauthorized",
      status: "error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends only the booking ID to the API schema and revalidates both read paths after commit", async () => {
    const api = authorizeWithRpc({ data: null, error: null });

    await expect(
      approveBooking(
        { status: "idle" },
        fields({
          bookingId: BOOKING_ID,
          billableDays: "1",
          deadline: "attacker controlled",
          totalDue: "1",
        }),
      ),
    ).resolves.toEqual({
      action: "approve",
      committed: true,
      status: "success",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(api.rpc).toHaveBeenCalledWith("approve_booking", {
      p_booking_id: BOOKING_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });

  it.each([
    ["42501", "approval_unauthorized", "unauthorized", "error"],
    ["P0002", "approval_booking_not_found", "not_found", "stale"],
    ["40001", "approval_stale_booking_state", "stale", "stale"],
    ["22023", "approval_profile_inactive", "profile_inactive", "error"],
    ["22023", "approval_verification_invalid", "verification_invalid", "error"],
    ["22023", "approval_camera_unavailable", "camera_unavailable", "error"],
    ["22023", "approval_template_unavailable", "template_unavailable", "error"],
    ["22023", "approval_template_invalid", "template_invalid", "error"],
    ["22023", "approval_invalid_period", "invalid_period", "error"],
    ["22023", "approval_price_unrepresentable", "price_unrepresentable", "error"],
    ["23P01", "approval_overlap", "availability_conflict", "stale"],
  ])(
    "maps and refreshes the committed contract %s/%s",
    async (code, message, category, status) => {
      authorizeWithRpc({
        data: null,
        error: { code, details: "private details", message },
      });

      const result = await approveBooking(
        { status: "idle" },
        fields({ bookingId: BOOKING_ID }),
      );

      expect(result).toEqual({ action: "approve", category, status });
      expect(JSON.stringify(result)).not.toMatch(/private details|approval_/);
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
      expect(revalidatePath).toHaveBeenCalledWith(
        `/admin/bookings/${BOOKING_ID}`,
      );
    },
  );

  it.each([
    {
      data: null,
      error: { code: "08006", message: "private database hostname" },
    },
    new Error("private network route"),
  ])("marks an unknown or interrupted outcome indeterminate", async (outcome) => {
    const rpc = vi.fn();
    if (outcome instanceof Error) rpc.mockRejectedValue(outcome);
    else rpc.mockResolvedValue(outcome);
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "admin-user" },
    } as never);

    const result = await approveBooking(
      { status: "idle" },
      fields({ bookingId: BOOKING_ID }),
    );

    expect(result).toEqual({
      action: "approve",
      category: "indeterminate",
      status: "indeterminate",
    });
    expect(JSON.stringify(result)).not.toMatch(/hostname|network route/);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });

  it("fails closed when administrator status cannot be checked", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new AdminAuthorizationCheckError(),
    );

    await expect(
      approveBooking(
        { status: "idle" },
        fields({ bookingId: BOOKING_ID }),
      ),
    ).resolves.toEqual({
      action: "approve",
      category: "indeterminate",
      status: "indeterminate",
    });
  });
});

describe("rejectBooking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates and trims the reason before authorization", async () => {
    await expect(
      rejectBooking(
        { status: "idle" },
        fields({ bookingId: BOOKING_ID, reason: "x" }),
      ),
    ).resolves.toEqual({
      action: "reject",
      fieldErrors: {
        reason: "Enter a reason between 2 and 1000 characters.",
      },
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it.each([
    Object.assign(new Error(), { name: "AuthenticationRequiredError" }),
    new AdminAuthorizationRequiredError(),
  ])("denies a direct unauthorized rejection without mutation", async (error) => {
    vi.mocked(requireAdmin).mockRejectedValue(error);

    const result = await rejectBooking(
      { status: "idle" },
      fields({ bookingId: BOOKING_ID, reason: "Not available" }),
    );

    expect(result).toEqual({
      action: "reject",
      category: "unauthorized",
      status: "error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when administrator status cannot be checked", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new AdminAuthorizationCheckError(),
    );

    await expect(
      rejectBooking(
        { status: "idle" },
        fields({ bookingId: BOOKING_ID, reason: "Not available" }),
      ),
    ).resolves.toEqual({
      action: "reject",
      category: "indeterminate",
      status: "indeterminate",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });

  it("marks a thrown rejection RPC outcome indeterminate and refreshes both views", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("private network route"));
    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "admin-user" },
    } as never);

    const result = await rejectBooking(
      { status: "idle" },
      fields({ bookingId: BOOKING_ID, reason: "Not available" }),
    );

    expect(result).toEqual({
      action: "reject",
      category: "indeterminate",
      status: "indeterminate",
    });
    expect(JSON.stringify(result)).not.toContain("private network route");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });

  it("sends exactly the booking ID and trimmed reason then revalidates persisted views", async () => {
    const api = authorizeWithRpc({ data: null, error: null });

    await expect(
      rejectBooking(
        { status: "idle" },
        fields({
          bookingId: BOOKING_ID,
          reason: "  Dates cannot be supported  ",
          state: "REJECTED",
        }),
      ),
    ).resolves.toEqual({
      action: "reject",
      committed: true,
      status: "success",
    });
    expect(api.rpc).toHaveBeenCalledWith("reject_booking", {
      p_booking_id: BOOKING_ID,
      p_reason: "Dates cannot be supported",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/bookings/${BOOKING_ID}`,
    );
  });

  it.each([
    ["42501", "admin authorization required", "unauthorized", "error"],
    [
      "40001",
      "booking state changed or transition precondition failed",
      "stale",
      "stale",
    ],
    ["08006", "private database detail", "indeterminate", "indeterminate"],
  ])(
    "maps a rejection outcome without leaking provider details",
    async (code, message, category, status) => {
      authorizeWithRpc({ data: null, error: { code, message } });

      const result = await rejectBooking(
        { status: "idle" },
        fields({ bookingId: BOOKING_ID, reason: "Not available" }),
      );

      expect(result).toEqual({
        action: "reject",
        category,
        status,
      });
      expect(JSON.stringify(result)).not.toContain(message);
      expect(revalidatePath).toHaveBeenCalledWith("/admin");
      expect(revalidatePath).toHaveBeenCalledWith(
        `/admin/bookings/${BOOKING_ID}`,
      );
    },
  );
});
