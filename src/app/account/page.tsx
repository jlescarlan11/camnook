import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { AccountProfile } from "@/features/bookings/components/account-profile";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { presentCustomerBookingStatus } from "@/features/bookings/customer-status";
import { loadAccountOverview } from "@/features/bookings/data/account";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { KycProfileForm } from "@/features/kyc/kyc-profile-form";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your rentals | CamNook" };

export default async function AccountPage() {
  const context = await requirePageUser("/account");
  const account = await loadAccountOverview(context);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="page-shell py-10 sm:py-14">
        <header className="flex flex-wrap items-center justify-between gap-6 border-b border-stone-200 pb-6">
          <div>
            <h1 className="page-title">Rentals</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            {account.status === "success" && account.isAdmin ? <Link className="button-secondary" href="/admin">Owner area</Link> : null}
            <form action={logout}><button className="button-secondary" type="submit">Sign out</button></form>
          </div>
        </header>

        {account.status === "error" ? (
          <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Account details unavailable</h2>
            <p className="mt-2 leading-7">We couldn’t load your profile or requests. Please retry before submitting another request.</p>
            <Link className="mt-3 inline-block font-semibold underline" href="/account">Try again</Link>
          </section>
        ) : (
          <div className="mt-10 grid items-start gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.75fr)]">
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
                            {booking.meetup ? <p className="mt-2 text-sm text-stone-600">Meetup: {booking.meetup.kind === "public_venue" ? `${booking.meetup.name} — ${booking.meetup.address}` : `${booking.meetup.areaLabel} — venue pending`}</p> : null}
                          </div>
                          <Link className="button-secondary whitespace-nowrap" href={`/account/bookings/${booking.id}`}>Open booking</Link>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <aside className="space-y-8">
              <section className="surface p-6" aria-labelledby="profile-heading">
                <h2 className="text-xl font-semibold" id="profile-heading">Profile</h2>
                <p className="mt-1 break-all text-sm text-stone-500">{context.user.email}</p>
                <AccountProfile profile={account.profile} />
              </section>
              <section className="surface p-6" aria-labelledby="default-address-heading" id="default-address">
                <h2 className="text-xl font-semibold" id="default-address-heading">Renter details</h2>
                <p className="mt-2 text-sm text-stone-600">Required before your first request.</p>
                <KycProfileForm kyc={account.kycProfile} profile={account.profile} returnTo="/account#default-address" />
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
