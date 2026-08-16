import "server-only";

import type { requireAdmin } from "@/lib/auth/require-admin";

import {
  ownerOperationsDashboardSchema,
  ownerPortfolioReportSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

export type PortfolioPeriod = {
  endDateExclusive: string;
  startDate: string;
};

export async function loadOwnerOperationsDashboard(context: AdminContext) {
  const result = await context.supabase
    .schema("api")
    .rpc("get_owner_operations_dashboard");
  const parsed = ownerOperationsDashboardSchema.safeParse(result.data);

  if (result.error || !parsed.success) return { status: "error" } as const;
  return { dashboard: parsed.data, status: "success" } as const;
}
export async function loadOwnerPortfolioReport(
  context: AdminContext,
  period: PortfolioPeriod,
) {
  const result = await context.supabase.schema("api").rpc(
    "get_owner_portfolio_report",
    {
      p_period_end: period.endDateExclusive,
      p_period_start: period.startDate,
    },
  );
  const parsed = ownerPortfolioReportSchema.safeParse(result.data);

  if (
    result.error ||
    !parsed.success ||
    parsed.data.period.start_date !== period.startDate ||
    parsed.data.period.end_date_exclusive !== period.endDateExclusive
  ) {
    return { status: "error" } as const;
  }

  return { report: parsed.data, status: "success" } as const;
}
