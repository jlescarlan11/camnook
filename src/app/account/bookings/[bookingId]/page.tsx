import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingActionCard, DetailValue } from "@/features/bookings/components/booking-action-card";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { PersistedIntendedUse } from "@/features/bookings/components/persisted-intended-use";
import {
  bookingPresentation,
  loadBookingDetailContext,
} from "@/features/bookings/data/account";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { presentCustomerBookingStatus } from "@/features/bookings/customer-status";
import { ContractDetails } from "@/features/contracts/components/contract-details";
import { SignContractControl } from "@/features/contracts/components/sign-contract-control";
import { PaymentPanel } from "@/features/payments/payment-panel";
import { loadPickupInstructions } from "@/features/pickup/config";
import { RenterPickupStatus } from "@/features/pickup/renter-pickup-status";
import { RenterResolutionStatus } from "@/features/resolution/renter-resolution-status";
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
  const result = await loadBookingDetailContext(context, bookingId);
  const pickupInstructions = loadPickupInstructions();
  if (result.status === "missing") notFound();
  const paymentResult = result.status === "success"
    ? { payment: result.payment, status: "success" as const }
    : { status: "error" as const };
  const pickupResult = result.status === "success"
    ? { pickup: result.pickup, status: "success" as const }
    : { status: "error" as const };
  const resolutionResult = result.status === "success"
    ? { resolution: result.resolution, status: "success" as const }
    : { status: "error" as const };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="page-shell py-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4" href="/account">Back to your rentals</Link>
        {result.status === "error" || result.status === "inconsistent" ? (
          <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
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
            <BookingActionCard booking={result.booking} />
            <article className="surface mt-6 p-6 sm:p-8" id="next-action">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">Booking details</h2>
                <span className="status-pill">{presentCustomerBookingStatus(result.booking.state, result.booking.requestedAt).label}</span>
              </div>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <DetailValue label="Pickup" value={formatManilaDateTime(result.booking.pickupAt)} />
                <DetailValue label="Return" value={formatManilaDateTime(result.booking.returnAt)} />
              </dl>
              {result.booking.meetup ? (
                <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="planned-meetup-heading">
                  <h2 className="text-lg font-semibold" id="planned-meetup-heading">Meetup</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    {result.booking.meetup.kind === "public_venue" ? <>
                      <DetailValue label="Venue" value={result.booking.meetup.name} />
                      <DetailValue label="Address" value={result.booking.meetup.address} />
                    </> : (
                      <DetailValue label="Venue" value="Pending owner confirmation" />
                    )}
                  </dl>
                  {result.booking.meetup.kind === "public_venue" ? <p className="mt-3 text-xs text-stone-500">{result.booking.meetup.attribution}</p> : null}
                </section>
              ) : null}
              <details className="mt-7 border-t border-stone-200 pt-6 text-sm"><summary className="cursor-pointer font-semibold text-[#0b4f9c]">Request details</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2"><DetailValue label="Requested" value={formatManilaDateTime(result.booking.requestedAt)} /><DetailValue label="Shooting city" value={result.booking.expectedLocation} /></dl><h2 className="mt-4 font-semibold">Purpose</h2><PersistedIntendedUse value={result.booking.intendedUse} /></details>
              {"approval" in result.booking ? (
                <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="approval-heading">
                  <h2 className="text-lg font-semibold" id="approval-heading">Price</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailValue label="Billable days" value={String(result.booking.approval.billableDays)} />
                    <DetailValue label="Rental amount" value={phpFormatter.format(result.booking.approval.rentalAmount)} />
                    <DetailValue label="Security deposit" value={phpFormatter.format(result.booking.approval.securityDeposit)} />
                    <DetailValue label="Total due" value={phpFormatter.format(result.booking.approval.totalDue)} />
                  </dl>
                </section>
              ) : null}
              {result.agreement && "approval" in result.booking ? (
                <>
                  <ContractDetails
                    agreement={result.agreement}
                    approvalDeadlineAt={
                      result.booking.approval.approvalDeadlineAt
                    }
                  />
                  {result.booking.state === "CONTRACT_PENDING" ? (
                    <SignContractControl
                      bookingId={result.booking.id}
                      canSign={
                        result.booking.state === "CONTRACT_PENDING" &&
                        result.agreement.current.status === "issued" &&
                        result.agreement.current.signature === null
                      }
                      contractVersionId={result.agreement.current.id}
                    />
                  ) : null}
                </>
              ) : null}
              {result.status === "success" &&
              "approval" in result.booking &&
              paymentResult.status === "success" ? (
                <PaymentPanel
                  attemptId={randomUUID()}
                  payment={paymentResult.payment}
                />
              ) : result.status === "success" &&
                "approval" in result.booking &&
                paymentResult.status !== "success" ? (
                <section
                  className="mt-7 border-t border-stone-200 pt-6"
                  role="alert"
                >
                  <h2 className="text-lg font-semibold">Payment unavailable</h2>
                  <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                    Authoritative payment instructions and state could not be
                    loaded. Do not transfer funds until this section is
                    available.
                  </p>
                </section>
              ) : null}
              {pickupResult.status === "success" ? (
                <RenterPickupStatus
                  instructions={pickupInstructions.status === "success" ? pickupInstructions.instructions : null}
                  meetup={result.booking.meetup}
                  pickup={pickupResult.pickup}
                />
              ) : (
                <section className="mt-7 border-t border-stone-200 pt-6" role="alert">
                  <h2 className="text-lg font-semibold">Pickup status unavailable</h2>
                  <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">Your owned timeline and safe handoff summary could not be loaded. Refresh before relying on the displayed state.</p>
                </section>
              )}
              {resolutionResult.status === "success" ? (
                <RenterResolutionStatus
                  operationId={randomUUID()}
                  resolution={resolutionResult.resolution}
                />
              ) : (
                <section className="mt-7 border-t border-stone-200 pt-6" role="alert">
                  <h2 className="text-lg font-semibold">Resolution status unavailable</h2>
                  <p className="mt-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">Your cancellation, return, and deposit outcome could not be safely loaded. Refresh before relying on any displayed amount.</p>
                </section>
              )}
            </article>
          </>
        )}
      </main>
    </div>
  );
}
