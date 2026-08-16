import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminQueue } from "@/features/bookings/admin/data";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import {
  loadPaymentAccountingSummary,
  loadPaymentReviewQueue,
} from "@/features/payments/data";
import { loadVerificationReviewQueue } from "@/features/verification/admin-data";
import { ID_TYPE_LABELS } from "@/features/verification/types";
import {
  loadActiveRentalQueue,
  loadPickupQueue,
} from "@/features/pickup/data";
import { loadResolutionQueues } from "@/features/resolution/data";
import { ResolutionQueuesPanel } from "@/features/resolution/resolution-queues";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin review | CamNook",
};

export default async function AdminPage() {
  const context = await requirePageAdmin("/admin");
  const [
    bookingQueue,
    verificationQueue,
    paymentQueue,
    accounting,
    pickupQueue,
    activeRentalQueue,
    resolutionQueues,
  ] = await Promise.all([
    loadAdminQueue(context),
    loadVerificationReviewQueue(context),
    loadPaymentReviewQueue(context),
    loadPaymentAccountingSummary(context),
    loadPickupQueue(context),
    loadActiveRentalQueue(context),
    loadResolutionQueues(context),
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
            complete. Manual payment reconciliation is also fail-closed until
            an administrator explicitly enables an approved recipient; this
            does not authorize Production rollout, handoff, refunds, or public
            launch.
          </p>
        </section>

        {accounting.status === "success" ? (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="payment-accounting-heading">
            <h2 className="text-xl font-semibold" id="payment-accounting-heading">Verified payment accounting</h2>
            <p className="mt-2 text-sm text-stone-600">
              Rental revenue and refundable security-deposit liability are reported separately.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <QueueValue label="Verified rental revenue" value={formatPhp(accounting.summary.verified_rental_revenue)} />
              <QueueValue label="Security-deposit liability" value={formatPhp(accounting.summary.security_deposit_liability)} />
            </dl>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900" role="alert">
            Payment accounting totals are unavailable. Do not use this page for financial reporting until they reload.
          </section>
        )}

        {pickupQueue.status === "error" ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Pickup queue unavailable</h2>
            <p className="mt-2 leading-7">Current eligibility could not be rechecked. Do not release equipment until this queue reloads.</p>
          </section>
        ) : pickupQueue.items.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" role="status">
            <h2 className="text-xl font-semibold">No bookings are ready for pickup</h2>
            <p className="mt-2 text-stone-600">Only CONFIRMED bookings with current identity, contract, and verified-payment evidence appear here.</p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="pickup-queue-heading">
            <h2 className="text-2xl font-semibold" id="pickup-queue-heading">Ready for pickup</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">The queue contains eligible CONFIRMED bookings only. It uses verification metadata, never private identity evidence.</p>
            <ul className="mt-5 space-y-4">
              {pickupQueue.items.map((item) => (
                <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={item.booking_id}>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <QueueValue label="Renter" value={item.renter_legal_name} />
                    <QueueValue label="Camera" value={item.camera_name} />
                    <QueueValue label="Pickup" value={formatManilaDateTime(item.pickup_at)} />
                    <QueueValue label="Identity current through" value={item.verification_expiration_date} />
                  </dl>
                  <p className="mt-4 text-sm text-stone-600">Checklist: named renter, original ID, serial, {item.accessory_count} inclusion{item.accessory_count === 1 ? "" : "s"}, and written condition report. Photos are optional.</p>
                  <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href={`/admin/bookings/${item.booking_id}`}>Complete pickup checklist</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeRentalQueue.status === "error" ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Active-rental queue unavailable</h2>
            <p className="mt-2 leading-7">Expected returns and contact context could not be loaded.</p>
          </section>
        ) : activeRentalQueue.items.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" role="status">
            <h2 className="text-xl font-semibold">No active rentals</h2>
            <p className="mt-2 text-stone-600">Rentals appear here only after the pickup transaction commits.</p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="active-rentals-heading">
            <h2 className="text-2xl font-semibold" id="active-rentals-heading">Active rentals and expected returns</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Urgency is schedule-only. CamNook does not calculate a late-return amount automatically.</p>
            <ul className="mt-5 space-y-4">
              {activeRentalQueue.items.map((item) => (
                <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={item.booking_id}>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <QueueValue label="Renter" value={item.renter_legal_name} />
                    <QueueValue label="Necessary contact" value={item.renter_phone} />
                    <QueueValue label="Camera" value={item.camera_name} />
                    <QueueValue label="Expected return" value={formatManilaDateTime(item.expected_return_at)} />
                    <QueueValue label="Operational urgency" value={urgencyLabel(item.urgency)} />
                    <QueueValue label="Actual pickup" value={formatManilaDateTime(item.actual_pickup_at)} />
                  </dl>
                  <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href={`/admin/bookings/${item.booking_id}`}>View active handoff</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {resolutionQueues.status === "success" ? (
          <ResolutionQueuesPanel queues={resolutionQueues.queues} />
        ) : (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Resolution queues unavailable</h2>
            <p className="mt-2 leading-7">Return inspections, cancellation requests, and deposit liabilities could not be safely loaded. Do not make an off-system resolution.</p>
          </section>
        )}

        {paymentQueue.status === "error" ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Payment queue unavailable</h2>
            <p className="mt-2 leading-7">Current submitted transfers could not be loaded. Refresh before reconciling any payment.</p>
          </section>
        ) : paymentQueue.items.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" role="status">
            <h2 className="text-xl font-semibold">No payments await reconciliation</h2>
            <p className="mt-2 text-stone-600">Only current submitted incoming transfers in PAYMENT_REVIEW appear here.</p>
          </section>
        ) : (
          <section className="mt-8" aria-labelledby="payment-waiting-heading">
            <h2 className="text-2xl font-semibold" id="payment-waiting-heading">Payments waiting for reconciliation</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Oldest submissions appear first and are marked against the 12-hour target. The queue omits proof paths, URLs, digests, and unrelated renter data.
            </p>
            <ul className="mt-5 space-y-4">
              {paymentQueue.items.map((item) => (
                <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={item.transaction_id}>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <QueueValue label="Renter" value={item.renter_legal_name} />
                    <QueueValue label="Camera" value={item.camera_name} />
                    <QueueValue label="Declared amount" value={formatPhp(item.declared_amount)} />
                    <QueueValue label="Queue age" value={formatQueueAge(item.age_seconds)} />
                    <QueueValue label="Review target" value={item.age_seconds >= 43_200 ? "12-hour target exceeded" : "Within 12-hour target"} />
                    <QueueValue label="Sender" value={item.sender_name} />
                    <QueueValue label="Reference" value={item.reference} />
                    <QueueValue label="Original deadline" value={formatManilaDateTime(item.approval_deadline_at)} />
                    <QueueValue label="Private proof" value={item.proof_exists ? "Attached" : "Not attached"} />
                  </dl>
                  <p className="mt-4 text-sm text-stone-500">Submitted {formatManilaDateTime(item.submitted_at)}</p>
                  <Link className="mt-5 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href={`/admin/payments/${item.transaction_id}`}>
                    Reconcile payment
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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

function urgencyLabel(urgency: "due_today" | "overdue" | "upcoming") {
  if (urgency === "overdue") return "Overdue — follow up now";
  if (urgency === "due_today") return "Due today";
  return "Upcoming";
}

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function formatPhp(value: number) {
  return phpFormatter.format(value);
}

function QueueValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
