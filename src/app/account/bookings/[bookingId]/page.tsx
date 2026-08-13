import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { PersistedIntendedUse } from "@/features/bookings/components/persisted-intended-use";
import {
  bookingPresentation,
  loadBookingDetail,
} from "@/features/bookings/data/account";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Booking details | CamNook" };

type BookingDetailPageProps = {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ requested?: string | string[] }>;
};

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export default async function BookingDetailPage({ params, searchParams }: BookingDetailPageProps) {
  const [{ bookingId }, query] = await Promise.all([params, searchParams]);
  const requested = query.requested === "1" ? "?requested=1" : "";
  const context = await requirePageUser(
    `/account/bookings/${bookingId}${requested}`,
  );
  const result = await loadBookingDetail(context, bookingId);
  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline decoration-amber-300 underline-offset-4" href="/account">← Back to account</Link>
        {result.status === "error" ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h1 className="text-2xl font-semibold">Booking unavailable</h1>
            <p className="mt-2 leading-7">{bookingPresentation(result).message}</p>
          </section>
        ) : (
          <>
            {query.requested === "1" ? (
              <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
                Your booking request was saved.
              </p>
            ) : null}
            <article className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Persisted booking</p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight">{result.booking.camera.name}</h1>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">{result.booking.state}</span>
              </div>
              <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                FOR_REVIEW does not reserve inventory. Approval is subject to verification and availability.
              </p>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <DetailValue label="Pickup (Asia/Manila)" value={formatManilaDateTime(result.booking.pickupAt)} />
                <DetailValue label="Return (Asia/Manila)" value={formatManilaDateTime(result.booking.returnAt)} />
                <DetailValue label="Requested (Asia/Manila)" value={formatManilaDateTime(result.booking.requestedAt)} />
                <DetailValue label="Expected location" value={result.booking.expectedLocation} />
              </dl>
              <section className="mt-7 border-t border-stone-200 pt-6">
                <h2 className="text-lg font-semibold">Intended use</h2>
                <PersistedIntendedUse value={result.booking.intendedUse} />
              </section>
              {"approval" in result.booking ? (
                <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="approval-heading">
                  <h2 className="text-lg font-semibold" id="approval-heading">Approval pricing snapshot</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailValue label="Approved" value={formatManilaDateTime(result.booking.approval.approvedAt)} />
                    <DetailValue label="Approval deadline" value={formatManilaDateTime(result.booking.approval.approvalDeadlineAt)} />
                    <DetailValue label="Billable days" value={String(result.booking.approval.billableDays)} />
                    <DetailValue label="Daily rate" value={phpFormatter.format(result.booking.approval.dailyRate)} />
                    <DetailValue label="Rental amount" value={phpFormatter.format(result.booking.approval.rentalAmount)} />
                    <DetailValue label="Security deposit" value={phpFormatter.format(result.booking.approval.securityDeposit)} />
                    <DetailValue label="Total due" value={phpFormatter.format(result.booking.approval.totalDue)} />
                    <DetailValue label="Currency" value={result.booking.approval.currency} />
                  </dl>
                </section>
              ) : null}
            </article>
          </>
        )}
      </main>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
