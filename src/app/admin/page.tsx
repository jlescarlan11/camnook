import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { OwnerOperationsPanel } from "@/features/portfolio/owner-dashboard";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageUser } from "@/lib/auth/require-user";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Action needed | CamNook" };
export default async function AdminPage() { const context = await requirePageUser("/admin"); const data = await loadAdminDashboardContext(context, null); if ("forbidden" in data) redirect("/forbidden"); return <div className="min-h-screen text-stone-950"><SiteHeader /><main className="page-shell py-8 sm:py-12"><OwnerNav current="dashboard" /><p className="eyebrow mt-8">Owner agenda</p><h1 className="page-heading mt-3">Today</h1><p className="mt-3 max-w-2xl text-stone-600">Upcoming handoffs and the work that needs a decision.</p>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} mode="overview" /> : <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5" role="alert">Current operations could not be verified. <Link className="font-semibold underline" href="/admin">Retry</Link></p>}</main></div>; }
export function AdminNav({ current }: { current: "operations" | "queues" | "settings" | "reports" }) { return <OwnerNav current={current === "queues" ? "bookings" : current === "settings" ? "settings" : current === "reports" ? "reports" : "dashboard"} />; }
