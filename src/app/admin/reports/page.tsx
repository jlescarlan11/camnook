import { redirect } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { OwnerPortfolioPanel } from "@/features/portfolio/owner-dashboard";
import { resolvePortfolioPeriod } from "@/features/portfolio/period";
import { requirePageUser } from "@/lib/auth/require-user";
import { AdminNav } from "../page";
export const dynamic = "force-dynamic";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const selection = resolvePortfolioPeriod(await searchParams); const context = await requirePageUser("/admin/reports"); const data = await loadAdminDashboardContext(context, selection.status === "valid" ? selection.period : null); if ("forbidden" in data) redirect("/forbidden"); return <div className="min-h-screen bg-stone-100"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><AdminNav current="reports" /><h1 className="mt-6 text-4xl font-semibold">Reports</h1><OwnerPortfolioPanel invalidPeriod={selection.status === "invalid"} period={selection.period} report={data.portfolio.status === "success" ? data.portfolio.report : null} /></main></div>; }
