import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadAdminDashboardContext } from "./data";
import {
  emptyOwnerOperationsDashboard,
  emptyOwnerPortfolioReport,
} from "./test-fixtures";

function contextWith(
  implementation: (name: string, args?: unknown) => Promise<unknown>,
) {
  const rpc = vi.fn(implementation);
  return {
    context: {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "owner" },
    } as never,
    rpc,
  };
}

describe("owner portfolio data loaders", () => {
  it("loads the complete admin dashboard through one snapshot RPC", async () => {
    const api = contextWith(async () => ({
      data: {
        gcash_configuration: {
          enabled: true,
          recipient_account: "09171234567",
          recipient_name: "CamNook Recipient",
          version: 4,
        },
        handoff_policies: [{
          camera_id: "11111111-1111-4111-8111-111111111111",
          camera_name: "Canon R50",
          camera_status: "published",
          city_label: "Cebu City",
          enabled: true,
          version: 2,
        }],
        operations: emptyOwnerOperationsDashboard,
        portfolio: emptyOwnerPortfolioReport,
      },
      error: null,
    }));
    const period = {
      endDateExclusive: "2026-08-17",
      startDate: "2026-08-01",
    };

    await expect(
      loadAdminDashboardContext(api.context, period),
    ).resolves.toMatchObject({
      gcashConfiguration: { status: "success" },
      handoffPolicies: { cameras: [{ cameraName: "Canon R50" }] },
      operations: { status: "success" },
      portfolio: { status: "success" },
    });
    expect(api.rpc).toHaveBeenCalledTimes(1);
    expect(api.rpc).toHaveBeenCalledWith("get_admin_dashboard_context", {
      p_period_end: "2026-08-17",
      p_period_start: "2026-08-01",
    });
  });

  it("preserves the database admin denial for the page redirect", async () => {
    const api = contextWith(async () => ({
      data: null,
      error: { code: "42501", message: "admin authorization required" },
    }));

    await expect(
      loadAdminDashboardContext(api.context, null),
    ).resolves.toEqual({ forbidden: true });
  });

  it("fails the whole snapshot closed on an unexpected sensitive field", async () => {
    const api = contextWith(async () => ({
      data: {
        gcash_configuration: {
          enabled: true,
          recipient_account: "09171234567",
          recipient_name: "CamNook Recipient",
          version: 4,
        },
        handoff_policies: [],
        operations: emptyOwnerOperationsDashboard,
        portfolio: {
          ...emptyOwnerPortfolioReport,
        },
        private_reference: "PRIVATE-FULL-REFERENCE",
      },
      error: null,
    }));

    await expect(
      loadAdminDashboardContext(api.context, {
        endDateExclusive: "2026-08-17",
        startDate: "2026-08-01",
      }),
    ).resolves.toEqual({
      gcashConfiguration: { status: "error" },
      handoffPolicies: { status: "error" },
      operations: { status: "error" },
      portfolio: { status: "error" },
    });
  });

  it("fails the whole snapshot closed when its period drifts", async () => {
    const api = contextWith(async () => ({
      data: {
        gcash_configuration: {
          enabled: true,
          recipient_account: "09171234567",
          recipient_name: "CamNook Recipient",
          version: 4,
        },
        handoff_policies: [],
        operations: emptyOwnerOperationsDashboard,
        portfolio: {
          ...emptyOwnerPortfolioReport,
          period: {
            ...emptyOwnerPortfolioReport.period,
            start_date: "2026-07-01",
          },
        },
      },
      error: null,
    }));

    await expect(
      loadAdminDashboardContext(api.context, {
        endDateExclusive: "2026-08-17",
        startDate: "2026-08-01",
      }),
    ).resolves.toMatchObject({
      operations: { status: "error" },
      portfolio: { status: "error" },
    });
  });
});
