import { SiteHeader } from "@/features/bookings/components/site-header";
import { OwnerNav } from "@/features/listings/owner-nav";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { OwnerOperationsPanel } from "@/features/portfolio/owner-dashboard";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function OwnerBookingsPage() {
  const context = await requirePageAdmin("/admin/bookings");
  const data = await loadAdminDashboardContext(context, null);
  if ("forbidden" in data) return null;
  return <div className="min-h-screen bg-stone-100 text-stone-950"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><OwnerNav current="bookings" /><h1 className="mt-8 text-4xl font-semibold">Bookings</h1><p className="mt-2 text-stone-600">Review incoming requests and complete the next handoff or return action.</p>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} /> : <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5" role="alert">Bookings could not be loaded.</p>}</main></div>;
}
