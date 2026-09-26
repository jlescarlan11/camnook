import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadProfilePage } from "./profile";

const contact = { account_status: "active", legal_name: "Test Renter", phone: "+639171234567" };
type ReadResult = { data: unknown; error: null | { message: string } };
const ok = (data: unknown): ReadResult => ({ data, error: null });

function fixture(overrides: Partial<Record<"profile" | "kyc" | "admin", ReadResult | Error>> = {}) {
  const read = async (key: "profile" | "kyc" | "admin", fallback: unknown) => {
    const value = overrides[key] ?? ok(fallback);
    if (value instanceof Error) throw value;
    return value;
  };
  const maybeSingle = vi.fn(() => read("profile", contact));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn((name: string) => {
    if (name === "get_my_kyc_profile_v2") return read("kyc", null);
    if (name === "is_admin") return read("admin", true);
    throw new Error("Unexpected RPC");
  });
  const schema = vi.fn(() => ({ from, rpc }));
  return { context: { user: { id: "own-user" }, supabase: { schema } } as never, schema, from, select, eq, maybeSingle, rpc };
}

describe("profile page data", () => {
  it("reads only the authenticated user's safe contact fields, even for an admin", async () => {
    const f = fixture();
    await expect(loadProfilePage(f.context)).resolves.toEqual({
      status: "success", isAdmin: true, kycProfile: null,
      profile: { accountStatus: "active", legalName: "Test Renter", phone: "+639171234567" },
    });
    expect(f.schema).toHaveBeenCalledWith("public");
    expect(f.from).toHaveBeenCalledWith("profiles");
    expect(f.select).toHaveBeenCalledWith("account_status, legal_name, phone");
    expect(f.eq).toHaveBeenCalledWith("user_id", "own-user");
    expect(f.maybeSingle).toHaveBeenCalledOnce();
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["get_my_kyc_profile_v2", "is_admin"]);
  });

  it("allows first-time setup when required reads successfully return null", async () => {
    const f = fixture({ profile: ok(null), admin: ok(false) });
    await expect(loadProfilePage(f.context)).resolves.toEqual({ status: "success", isAdmin: false, profile: null, kycProfile: null });
  });

  it.each(["profile", "kyc"] as const)("fails closed on an error, rejection, or malformed %s read", async (key) => {
    for (const failure of [new Error("private details"), { data: null, error: { message: "private details" } }, ok({ unexpected: true })]) {
      const f = fixture({ [key]: failure });
      await expect(loadProfilePage(f.context)).resolves.toEqual({ status: "error", isAdmin: true });
    }
  });

  it.each([new Error("unavailable"), { data: null, error: { message: "unavailable" } }, ok("true"), ok(null)])(
    "keeps the editor available while an unconfirmed admin lookup hides owner controls",
    async (admin) => {
      const f = fixture({ admin });
      await expect(loadProfilePage(f.context)).resolves.toMatchObject({ status: "success", isAdmin: false });
    },
  );
});
