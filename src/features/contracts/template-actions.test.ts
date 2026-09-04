import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  class AdminAuthorizationRequiredError extends Error {}
  return {
    AdminAuthorizationRequiredError,
    isAdminAuthorizationError: (error: { code?: string } | null) =>
      error?.code === "42501",
    isAuthenticationError: () => false,
  };
});

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import { publishContractTemplate } from "./template-actions";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";

function validForm() {
  const data = new FormData();
  data.set("expectedActiveId", "");
  data.set("version", "rental-v1");
  data.set("approval", "on");
  data.set("pickup", "Renter presents the booking at the agreed pickup time.");
  data.set("return", "Renter returns every inclusion at the agreed return time.");
  data.set("cancellation", "Cancellations follow the policy stated in this agreement.");
  data.set("late-return", "Late returns must be reported and resolved with the owner.");
  data.set("damage", "The renter is responsible for verified rental-period damage.");
  data.set("loss", "The renter must report and resolve any verified loss.");
  data.set("non-transferability", "Only the named renter may collect and use the camera.");
  return data;
}

function authenticate(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: TEMPLATE_ID },
  } as never);
  return rpc;
}

describe("contract template administration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires every term and explicit approval before authorization", async () => {
    const data = validForm();
    data.delete("damage");
    data.delete("approval");

    await expect(
      publishContractTemplate({ status: "idle" }, data),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: { approval: expect.any(String), terms: expect.any(String) },
      status: "error",
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("publishes only validated, fixed-schema terms", async () => {
    const rpc = authenticate({
      data: { created: true, id: TEMPLATE_ID, version: "rental-v1" },
      error: null,
    });

    await expect(
      publishContractTemplate({ status: "idle" }, validForm()),
    ).resolves.toEqual({
      created: true,
      status: "success",
      version: "rental-v1",
    });
    expect(rpc).toHaveBeenCalledWith("publish_contract_template", {
      p_expected_active_id: null,
      p_operation_id: expect.any(String),
      p_terms: expect.objectContaining({
        damage: expect.any(String),
        pickup: expect.any(String),
      }),
      p_version: "rental-v1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  it.each([
    ["40001", "stale"],
    ["42501", "unauthorized"],
    ["23505", "version_conflict"],
  ] as const)("maps database error %s", async (code, error) => {
    authenticate({ data: null, error: { code } });

    await expect(
      publishContractTemplate({ status: "idle" }, validForm()),
    ).resolves.toEqual({ error, status: "error" });
  });
});
