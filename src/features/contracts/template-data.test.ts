import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadContractTemplateConfiguration } from "./template-data";

const active = {
  activated_at: "2026-09-04T05:00:00Z",
  approved_at: "2026-09-04T05:00:00Z",
  content_sha256: "a".repeat(64),
  created_at: "2026-09-04T05:00:00Z",
  id: "11111111-1111-4111-8111-111111111111",
  schema_version: 1,
  terms: {
    cancellation: "Cancellation terms are complete.",
    damage: "Damage terms are complete.",
    loss: "Loss terms are complete.",
    "late-return": "Late return terms are complete.",
    "non-transferability": "Non-transferability terms are complete.",
    pickup: "Pickup terms are complete.",
    return: "Return terms are complete.",
  },
  version: "rental-v1",
};

function contextWith(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    context: {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: active.id },
    } as never,
    rpc,
  };
}

describe("contract template data", () => {
  it("loads the active template through the narrow admin RPC", async () => {
    const api = contextWith({ data: { active }, error: null });

    await expect(
      loadContractTemplateConfiguration(api.context),
    ).resolves.toEqual({ configuration: { active }, status: "success" });
    expect(api.rpc).toHaveBeenCalledWith(
      "get_contract_template_configuration_admin",
    );
  });

  it("fails closed when the payload contains an unexpected field", async () => {
    const api = contextWith({
      data: { active, private_note: "must not cross the DTO boundary" },
      error: null,
    });

    await expect(
      loadContractTemplateConfiguration(api.context),
    ).resolves.toEqual({ status: "error" });
  });

  it("preserves an admin denial", async () => {
    const api = contextWith({
      data: null,
      error: { code: "42501", message: "admin authorization required" },
    });

    await expect(
      loadContractTemplateConfiguration(api.context),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
