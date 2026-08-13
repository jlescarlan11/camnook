import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAccountData } from "@/features/bookings/data/account";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { getAdminStatus } from "@/lib/auth/require-admin";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account | CamNook",
};

export default async function AccountPage() {
  const context = await requirePageUser("/account");
  const [isAdmin, account] = await Promise.all([
    getAdminStatus(context),
    loadAccountData(context),
  ]);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">CamNook account</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your rental requests</h1>
            <p className="mt-3 text-stone-600">Signed in as {context.user.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isAdmin ? (
              <Link className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium" href="/admin">
                Admin area
              </Link>
            ) : null}
            <form action={logout}>
              <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {account.status === "error" ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Account details unavailable</h2>
            <p className="mt-2 leading-7">We couldn’t load your profile or requests. Please retry before submitting another request.</p>
            <Link className="mt-3 inline-block font-semibold underline" href="/account">Try again</Link>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="profile-heading">
              <h2 className="text-2xl font-semibold" id="profile-heading">Profile</h2>
              {account.profile ? (
                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                  <SummaryValue label="Legal name" value={account.profile.legalName} />
                  <SummaryValue label="Phone" value={account.profile.phone} />
                  <SummaryValue label="Account status" value={account.profile.accountStatus} />
                </dl>
              ) : (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <p>Your booking profile is not complete yet.</p>
                  <Link className="mt-2 inline-block font-semibold underline" href="/">Choose a camera to begin</Link>
                </div>
              )}
            </section>

            <section className="mt-8" aria-labelledby="bookings-heading">
              <h2 className="text-2xl font-semibold" id="bookings-heading">Bookings</h2>
              {account.bookings.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-6" role="status">
                  <p className="leading-7 text-stone-600">You don’t have any booking requests yet.</p>
                  <Link className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-stone-950 px-5 py-3 font-medium text-white" href="/">
                    Browse cameras
                  </Link>
                </div>
              ) : (
                <ul className="mt-5 space-y-4">
                  {account.bookings.map((booking) => (
                    <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={booking.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{booking.camera.name}</h3>
                          <p className="mt-1 text-sm text-stone-600">
                            {formatManilaDateTime(booking.pickupAt)} – {formatManilaDateTime(booking.returnAt)}
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">{booking.state}</span>
                      </div>
                      <p className="mt-3 text-sm text-stone-500">Requested {formatManilaDateTime(booking.requestedAt)} (Asia/Manila)</p>
                      <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href={`/account/bookings/${booking.id}`}>
                        View persisted request
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium capitalize">{value}</dd>
    </div>
  );
}
