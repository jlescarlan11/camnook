import "server-only";

import { z } from "zod";

import {
  adminCameraHandoffSummarySchema,
  projectAdminCameraHandoffSummary,
} from "@/features/listings/handoff-data";
import type { requireAdmin } from "@/lib/auth/require-admin";
import { gcashRecipientConfigurationSchema } from "@/features/payments/types";

import {
  ownerOperationsDashboardSchema,
  ownerPortfolioReportSchema,
} from "./types";

type AdminContext = Awaited<ReturnType<typeof requireAdmin>>;

const adminDashboardContextSchema = z.object({
  gcash_configuration: gcashRecipientConfigurationSchema,
  handoff_policies: z.array(adminCameraHandoffSummarySchema),
  operations: ownerOperationsDashboardSchema,
  portfolio: ownerPortfolioReportSchema.nullable(),
}).strict();

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

export async function loadAdminDashboardContext(
  context: AdminContext,
  period: PortfolioPeriod | null,
) {
  const result = await context.supabase.schema("api").rpc(
    "get_admin_dashboard_context",
    {
      p_period_end: period?.endDateExclusive ?? null,
      p_period_start: period?.startDate ?? null,
    },
  );
  const parsed = adminDashboardContextSchema.safeParse(result.data);
  const portfolioValid = !period || (
    parsed.success &&
    parsed.data.portfolio !== null &&
    parsed.data.portfolio.period.start_date === period.startDate &&
    parsed.data.portfolio.period.end_date_exclusive === period.endDateExclusive
  );

  if (result.error || !parsed.success || !portfolioValid) {
    return {
      gcashConfiguration: { status: "error" as const },
      handoffPolicies: { status: "error" as const },
      operations: { status: "error" as const },
      portfolio: period
        ? { status: "error" as const }
        : { status: "invalid" as const },
    };
  }

  return {
    gcashConfiguration: {
      configuration: parsed.data.gcash_configuration,
      status: "success" as const,
    },
    handoffPolicies: {
      cameras: parsed.data.handoff_policies.map(
        projectAdminCameraHandoffSummary,
      ),
      status: "success" as const,
    },
    operations: {
      dashboard: parsed.data.operations,
      status: "success" as const,
    },
    portfolio: period && parsed.data.portfolio
      ? { report: parsed.data.portfolio, status: "success" as const }
      : { status: "invalid" as const },
  };
}
