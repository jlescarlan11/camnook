import type { Metadata } from "next";
import Link from "next/link";

import { AccountPageShell } from "@/features/account/components/account-page-shell";
import { presentCustomerBookingStatus } from "@/features/bookings/customer-status";
import { loadAccountOverview } from "@/features/bookings/data/account";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your rentals | CamNook" };

export default async function AccountPage() {
  const context = await requirePageUser("/account");
  const account = await loadAccountOverview(context).catch(() => ({ status: "error" as const }));

  return (
    <AccountPageShell title="Your rentals" activeSection="rentals" isAdmin={account.status === "success" && account.isAdmin}>
        {account.status === "error" ? (
          <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Rentals unavailable</h2>
            <p className="mt-2 leading-7">We couldn’t load your bookings. Please retry before submitting another request.</p>
            <Link className="mt-3 inline-block font-semibold underline" href="/account">Try again</Link>
          </section>
        ) : (
          <div className="mt-10">
            <section aria-labelledby="bookings-heading">
              <div className="flex items-center justify-between gap-4">
                <h2 className="section-heading" id="bookings-heading">Your bookings</h2>
                <Link className="font-semibold text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4" href="/">Find a camera</Link>
              </div>
              {account.bookings.length === 0 ? (
                <div className="surface mt-5 p-6" role="status">
                  <p className="leading-7 text-stone-600">You don’t have any booking requests yet.</p>
                  <Link className="button-primary mt-5" href="/">Browse cameras</Link>
                </div>
              ) : (
                <ol className="mt-5 border-t border-stone-200">
                  {account.bookings.map((booking) => {
                    const status = presentCustomerBookingStatus(booking.state, booking.requestedAt, booking.pickupAt);
                    return (
                      <li className="border-b border-stone-200 py-6" key={booking.id}>
                        <div className="grid gap-5 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-start">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Pickup</p>
                            <p className="mt-1 font-semibold">{formatManilaDateTime(booking.pickupAt)}</p>
                            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Return</p>
                            <p className="mt-1 text-sm">{formatManilaDateTime(booking.returnAt)}</p>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold">{booking.camera.name}</h3>
                            <p className="mt-1 text-sm font-medium text-[#0b4f9c]">{status.label}</p>
                            <p className="mt-2 max-w-xl text-sm text-stone-600">{status.nextStep}</p>
                            {booking.meetup ? <p className="mt-2 text-sm text-stone-600">Meetup: {booking.meetup.kind !== "canonical_area" ? `${booking.meetup.name} — ${booking.meetup.address}` : `${booking.meetup.areaLabel} — venue pending`}</p> : null}
                          </div>
                          <Link className="button-secondary whitespace-nowrap" href={`/account/bookings/${booking.id}`}>Open booking</Link>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

          </div>
        )}
      <p className="mt-8 text-sm text-stone-600" id="default-address">
        Manage renter details in <Link className="font-semibold text-[#0b4f9c] underline underline-offset-4" href="/account/profile#renter-details">Profile</Link>.
      </p>
    </AccountPageShell>
  );
}
