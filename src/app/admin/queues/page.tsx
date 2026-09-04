import { redirect } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { OwnerOperationsPanel } from "@/features/portfolio/owner-dashboard";
import { requirePageUser } from "@/lib/auth/require-user";
import { AdminNav } from "../page";
export const dynamic = "force-dynamic";
export default async function AllQueuesPage() { const context = await requirePageUser("/admin/queues"); const data = await loadAdminDashboardContext(context, null); if ("forbidden" in data) redirect("/forbidden"); return <div className="min-h-screen bg-stone-100"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><AdminNav current="queues" /><h1 className="mt-6 text-4xl font-semibold">All queues</h1>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} /> : <p className="mt-6" role="alert">Queues are unavailable.</p>}</main></div>; }
