import Link from "next/link";
import { AppliedFiltersForm } from "@/components/applied-filters-form";
import { bookingStates } from "@/domain/bookings/state-machine";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadBookingHistory } from "@/features/bookings/admin/history-data";
import { bookingHistoryHref, bookingHistoryStateLabels, parseBookingHistoryFilters } from "@/features/bookings/admin/history-filters";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function BookingHistoryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePageAdmin("/admin/bookings/history");
  const parsed = parseBookingHistoryFilters(await searchParams);
  const filters = parsed.success ? parsed.data : { renter: "", state: "" as const, page: 1 };
  const history = parsed.success ? await loadBookingHistory(context.supabase, filters) : null;

  return <div className="min-h-screen text-stone-950">
    <SiteHeader />
    <main className="page-shell py-8 sm:py-12">
      <OwnerNav current="bookings" />
      <Link className="mt-6 inline-block text-sm underline" href="/admin/bookings">Back to booking work queues</Link>
      <h1 className="page-title mt-4">Booking history</h1>
      <p className="mt-2 text-stone-600">Find active and closed bookings, newest requests first. Times are in Manila time.</p>
      <AppliedFiltersForm filtersKey={bookingHistoryHref(filters)} className="mt-6 grid grid-cols-1 items-end gap-4 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm font-medium">Renter name
          <input className="min-w-0 rounded-lg border border-stone-300 px-3 py-2" defaultValue={filters.renter} maxLength={120} name="renter" type="search" />
        </label>
        <label className="grid gap-2 text-sm font-medium">Booking status
          <select className="min-w-0 rounded-lg border border-stone-300 px-3 py-2" defaultValue={filters.state} name="state">
            <option value="">All statuses</option>
            {bookingStates.map((state) => <option key={state} value={state}>{bookingHistoryStateLabels[state]}</option>)}
          </select>
        </label>
        <button className="button-primary" type="submit">Apply filters</button>
      </AppliedFiltersForm>
      <Link className="mt-3 inline-block text-sm underline" href="/admin/bookings/history">Clear filters</Link>
      {!parsed.success && <p className="mt-6 text-red-700" role="alert">These booking filters are invalid. Clear filters and try again.</p>}
      {history?.status === "error" && <p className="mt-6 text-red-700" role="alert">Booking history could not be loaded. Apply filters again to retry.</p>}
      {history?.status === "success" && <>
        {history.bookings.length === 0 ? <p className="mt-6 rounded-xl border border-stone-200 p-5">{filters.page > 1 ? "No bookings on this page. Return to a previous page or clear filters." : "No bookings match these filters."}</p> :
          <ul className="mt-6 grid gap-4">
            {history.bookings.map((booking) => <li className="min-w-0 rounded-xl border border-stone-200 bg-white p-5" key={booking.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 break-words">
                  <Link className="text-lg font-semibold underline" href={`/admin/bookings/${booking.id}`}>{booking.cameras.name} — {booking.profiles.legal_name}</Link>
                  <p className="mt-1 break-all text-xs text-stone-500">Reference: {booking.id}</p>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm">{bookingHistoryStateLabels[booking.state]}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-stone-500">Pickup</dt><dd>{formatManilaDateTime(booking.pickup_at)}</dd></div>
                <div><dt className="text-stone-500">Return</dt><dd>{formatManilaDateTime(booking.return_at)}</dd></div>
              </dl>
            </li>)}
          </ul>}
        <nav aria-label="Booking history pages" className="mt-6 flex flex-wrap items-center gap-4">
          {filters.page > 1 && <Link className="button-secondary" href={bookingHistoryHref({ ...filters, page: filters.page - 1 })}>Previous page</Link>}
          <span className="text-sm text-stone-600">Page {filters.page}</span>
          {history.hasNext && <Link className="button-secondary" href={bookingHistoryHref({ ...filters, page: filters.page + 1 })}>Next page</Link>}
        </nav>
      </>}
    </main>
  </div>;
}
