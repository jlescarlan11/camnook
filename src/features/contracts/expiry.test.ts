import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { expireDueBookings } from "./expiry";

describe("due booking expiration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an operation identity and returns only the aggregate count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc })),
    } as never);

    await expect(expireDueBookings()).resolves.toEqual({ expired: 3 });
    expect(rpc).toHaveBeenCalledWith("expire_due_bookings", {
      p_operation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it.each([
    { data: -1, error: null },
    { data: 101, error: null },
    { data: null, error: { message: "private database detail" } },
  ])("fails closed on an invalid or failed database outcome", async (result) => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({ rpc: vi.fn().mockResolvedValue(result) })),
    } as never);

    await expect(expireDueBookings()).rejects.toThrow(
      "Unable to expire due unsigned bookings",
    );
  });
});
