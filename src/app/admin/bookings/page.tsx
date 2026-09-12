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
  return <div className="min-h-screen text-stone-950"><SiteHeader /><main className="page-shell py-8 sm:py-12"><OwnerNav current="bookings" /><p className="eyebrow mt-8">Owner operations</p><h1 className="page-heading mt-3">Booking work</h1><p className="mt-3 max-w-2xl text-stone-600">Review incoming requests, payments, handoffs, returns, and deposit obligations by stage.</p>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} /> : <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5" role="alert">Bookings could not be loaded.</p>}</main></div>;
}
