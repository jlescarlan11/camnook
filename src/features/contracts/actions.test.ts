import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ getAuthenticatedUser: vi.fn() }));

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/require-user";

import { signContract } from "./actions";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function authorize(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    supabase: { schema },
    user: { id: "renter" },
  } as never);
  return { rpc, schema };
}

describe("signContract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires explicit consent and exact identifiers before authentication", async () => {
    const result = await signContract(
      { status: "idle" },
      form({ bookingId: BOOKING_ID, contractVersionId: VERSION_ID }),
    );

    expect(result).toMatchObject({
      error: "invalid_input",
      fieldErrors: { consent: expect.any(String) },
      status: "error",
    });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("sends only exact version identity and fixed consent to the API RPC", async () => {
    const api = authorize({
      data: [
        {
          created: true,
          signature_id: "44444444-4444-4444-8444-444444444444",
          signed_at: "2026-08-15T01:00:00Z",
        },
      ],
      error: null,
    });

    const result = await signContract(
      { status: "idle" },
      form({
        bookingId: BOOKING_ID,
        consent: "on",
        contractVersionId: VERSION_ID,
        renter: "attacker",
        snapshot: "attacker",
      }),
    );

    expect(result).toEqual({ created: true, status: "success" });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(api.rpc).toHaveBeenCalledWith("sign_contract", {
      p_consent: true,
      p_contract_version_id: VERSION_ID,
    });
    expect(revalidatePath).toHaveBeenCalledWith(
      `/account/bookings/${BOOKING_ID}`,
    );
  });

  it("reports an idempotent retry without treating it as a duplicate", async () => {
    authorize({
      data: [
        {
          created: false,
          signature_id: "44444444-4444-4444-8444-444444444444",
          signed_at: "2026-08-15T01:00:00Z",
        },
      ],
      error: null,
    });

    await expect(
      signContract(
        { status: "idle" },
        form({
          bookingId: BOOKING_ID,
          consent: "on",
          contractVersionId: VERSION_ID,
        }),
      ),
    ).resolves.toEqual({ created: false, status: "success" });
  });

  it.each([
    ["42501", "contract_signing_unauthorized", "unauthorized", "error"],
    ["40001", "contract_version_stale", "stale", "stale"],
    ["22023", "contract_deadline_elapsed", "expired", "stale"],
  ])("constrains RPC failure %s/%s", async (code, message, error, status) => {
    authorize({ data: null, error: { code, details: "private", message } });

    const result = await signContract(
      { status: "idle" },
      form({
        bookingId: BOOKING_ID,
        consent: "on",
        contractVersionId: VERSION_ID,
      }),
    );

    expect(result).toEqual({ error, status });
    expect(JSON.stringify(result)).not.toMatch(/private|contract_/);
  });

  it("marks an interrupted outcome indeterminate for a safe refresh/retry", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("private network route"));
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "renter" },
    } as never);

    const result = await signContract(
      { status: "idle" },
      form({
        bookingId: BOOKING_ID,
        consent: "on",
        contractVersionId: VERSION_ID,
      }),
    );

    expect(result).toEqual({ error: "unknown", status: "indeterminate" });
    expect(JSON.stringify(result)).not.toContain("network");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/account/bookings/${BOOKING_ID}`,
    );
  });
});
