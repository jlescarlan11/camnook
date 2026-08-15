import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminQueue } from "@/features/bookings/admin/data";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { loadVerificationReviewQueue } from "@/features/verification/admin-data";
import { ID_TYPE_LABELS } from "@/features/verification/types";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin review | CamNook",
};

export default async function AdminPage() {
  const context = await requirePageAdmin("/admin");
  const [bookingQueue, verificationQueue] = await Promise.all([
    loadAdminQueue(context),
    loadVerificationReviewQueue(context),
  ]);

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
              Review queues
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
            The audited identity-review workflow is implemented for authorized
            administrators, but Production collection of real IDs remains
            disabled until the documented privacy and operating approvals are
            complete. This does not open contract signing, payments, handoff,
            refunds, or public-launch actions.
          </p>
        </section>

        {verificationQueue.status === "error" ? (
          <section
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h2 className="text-xl font-semibold">Identity queue unavailable</h2>
            <p className="mt-2 leading-7">
              Current safe verification metadata could not be loaded. Refresh
              before requesting evidence access or making a decision.
            </p>
          </section>
        ) : verificationQueue.items.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" role="status">
            <h2 className="text-xl font-semibold">No identities await review</h2>
            <p className="mt-2 text-stone-600">
              Only the latest retained pending submission for each renter appears here.
            </p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="identity-waiting-heading">
            <h2 className="text-2xl font-semibold" id="identity-waiting-heading">
              Identity submissions waiting for a decision
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Oldest submissions appear first. The queue omits private evidence
              paths, tokens, digests, phone numbers, and unrelated identity data.
            </p>
            <ul className="mt-5 space-y-4">
              {verificationQueue.items.map((item) => (
                <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={item.record_id}>
                  <dl className="grid gap-4 sm:grid-cols-3">
                    <QueueValue label="Renter" value={item.renter_legal_name} />
                    <QueueValue label="Submitted type" value={ID_TYPE_LABELS[item.id_type]} />
                    <QueueValue label="Queue age" value={formatQueueAge(item.age_seconds)} />
                  </dl>
                  <p className="mt-4 text-sm text-stone-500">
                    Submitted {formatManilaDateTime(item.submitted_at)}
                  </p>
                  <Link
                    className="mt-5 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4"
                    href={`/admin/verifications/${item.record_id}`}
                  >
                    Review identity
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bookingQueue.status === "error" ? (
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
        ) : bookingQueue.bookings.length === 0 ? (
          <section
            className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
            role="status"
          >
            <h2 className="text-xl font-semibold">No bookings await review</h2>
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
              {bookingQueue.bookings.map((booking) => (
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

function formatQueueAge(seconds: number) {
  if (seconds < 60) return "Less than a minute";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr`;
  return `${Math.floor(seconds / 86_400)} days`;
}

function QueueValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
