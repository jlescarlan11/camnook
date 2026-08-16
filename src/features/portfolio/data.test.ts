import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadOwnerOperationsDashboard,
  loadOwnerPortfolioReport,
} from "./data";
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
  it("loads strict database-owned operations and period projections", async () => {
    const api = contextWith(async (name) => ({
      data:
        name === "get_owner_operations_dashboard"
          ? emptyOwnerOperationsDashboard
          : emptyOwnerPortfolioReport,
      error: null,
    }));

    await expect(
      loadOwnerOperationsDashboard(api.context),
    ).resolves.toMatchObject({ status: "success" });
    await expect(
      loadOwnerPortfolioReport(api.context, {
        endDateExclusive: "2026-08-17",
        startDate: "2026-08-01",
      }),
    ).resolves.toMatchObject({ status: "success" });
    expect(api.rpc).toHaveBeenNthCalledWith(2, "get_owner_portfolio_report", {
      p_period_end: "2026-08-17",
      p_period_start: "2026-08-01",
    });
  });

  it("fails closed on count drift or an unexpected sensitive field", async () => {
    const api = contextWith(async () => ({
      data: {
        ...emptyOwnerOperationsDashboard,
        queue_counts: {
          ...emptyOwnerOperationsDashboard.queue_counts,
          payment: 1,
        },
        reference: "PRIVATE-FULL-REFERENCE",
      },
      error: null,
    }));

    await expect(loadOwnerOperationsDashboard(api.context)).resolves.toEqual({
      status: "error",
    });
  });

  it("fails closed when a report period or camera rollup does not match", async () => {
    const api = contextWith(async () => ({
      data: {
        ...emptyOwnerPortfolioReport,
        portfolio: {
          ...emptyOwnerPortfolioReport.portfolio,
          camera_count: 1,
        },
      },
      error: null,
    }));

    await expect(
      loadOwnerPortfolioReport(api.context, {
        endDateExclusive: "2026-08-17",
        startDate: "2026-08-01",
      }),
    ).resolves.toEqual({ status: "error" });
  });
});
