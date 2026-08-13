import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminQueue } from "@/features/bookings/admin/data";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking review | CamNook",
};

export default async function AdminPage() {
  const context = await requirePageAdmin("/admin");
  const queue = await loadAdminQueue(context);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
              Authorized admin
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Booking review queue
            </h1>
            <p className="mt-3 text-stone-600">
              Signed in as {context.user.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium"
              href="/account"
            >
              Account
            </Link>
            <form action={logout}>
              <button
                className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <section
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
          aria-labelledby="closed-gates-heading"
        >
          <h2 className="font-semibold" id="closed-gates-heading">
            Launch gates remain closed
          </h2>
          <p className="mt-1">
            This queue does not enable verification decisions or ID uploads,
            private document reads, contract signing or PDFs, payments,
            cancellation, handoff, refunds, or public-launch actions.
          </p>
        </section>

        {queue.status === "error" ? (
          <section
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h2 className="text-xl font-semibold">Queue unavailable</h2>
            <p className="mt-2 leading-7">
              The review queue could not be loaded. Refresh before making any
              decision.
            </p>
            <Link className="mt-3 inline-block font-semibold underline" href="/admin">
              Try again
            </Link>
          </section>
        ) : queue.bookings.length === 0 ? (
          <section
            className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
            role="status"
          >
            <h2 className="text-xl font-semibold">No requests await review</h2>
            <p className="mt-2 leading-7 text-stone-600">
              New renter requests will appear here after they are persisted.
            </p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="waiting-heading">
            <h2 className="text-2xl font-semibold" id="waiting-heading">
              Waiting for a decision
            </h2>
            <ul className="mt-5 space-y-4">
              {queue.bookings.map((booking) => (
                <li
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
                  key={booking.id}
                >
                  <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <QueueValue label="Renter" value={booking.renterLegalName} />
                    <QueueValue label="Camera" value={booking.cameraName} />
                    <QueueValue
                      label="Pickup (Asia/Manila)"
                      value={formatManilaDateTime(booking.pickupAt)}
                    />
                    <QueueValue
                      label="Return (Asia/Manila)"
                      value={formatManilaDateTime(booking.returnAt)}
                    />
                  </dl>
                  <p className="mt-4 text-sm text-stone-500">
                    Requested {formatManilaDateTime(booking.requestedAt)}
                  </p>
                  <Link
                    className="mt-5 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4"
                    href={`/admin/bookings/${booking.id}`}
                  >
                    Review request
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function QueueValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
