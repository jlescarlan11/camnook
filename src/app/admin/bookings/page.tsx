import Link from "next/link";
import { BookingsLoadError } from "@/features/portfolio/bookings-load-error";
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
  return <div className="min-h-screen text-stone-950"><SiteHeader /><main className="page-shell py-8 sm:py-12"><OwnerNav current="bookings" /><div className="mt-8 flex flex-wrap items-center justify-between gap-4"><h1 className="page-title">Bookings</h1><Link className="button-secondary" href="/admin/bookings/history">Booking history</Link></div>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} /> : <BookingsLoadError />}</main></div>;
}
