import { MeetupDetails } from "@/features/meetups/meetup-details";
import { BookingBackLink } from "@/features/bookings/admin/booking-back-link";
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { DecisionControls } from "@/features/bookings/admin/decision-controls";
import { loadAdminBookingPageContext } from "@/features/bookings/admin/data";
import { ApprovalReadinessPanel } from "@/features/bookings/admin/approval-readiness-panel";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { PersistedIntendedUse } from "@/features/bookings/components/persisted-intended-use";
import {
  formatManilaDateTime,
  formatManilaDateTimeInput,
} from "@/features/bookings/manila-time";
import { ContractDetails } from "@/features/contracts/components/contract-details";
import { SupersedeContractControl } from "@/features/contracts/components/supersede-contract-control";
import { getAdminStatus } from "@/lib/auth/require-admin";
import { requirePageUser } from "@/lib/auth/require-user";
import { PickupControls } from "@/features/pickup/pickup-controls";
import {
  ResolutionControls,
  type ResolutionOperationIds,
} from "@/features/resolution/resolution-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin booking review | CamNook" };

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});



type AdminBookingPageProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function AdminBookingPage({ params }: AdminBookingPageProps) {
  const { bookingId } = await params;
  const context = await requirePageUser(`/admin/bookings/${bookingId}`);
  if (!z.uuid().safeParse(bookingId).success) {
    if (!(await getAdminStatus(context))) redirect("/forbidden");
    notFound();
  }
  const {
    contractData,
    pickupData,
    resolutionData,
    result,
  } = await loadAdminBookingPageContext(context, bookingId);

  if (result.status === "forbidden") redirect("/forbidden");
  if (result.status === "missing") notFound();
  const resolutionOperationIds: ResolutionOperationIds | null =
    resolutionData?.status === "success"
      ? {
          cancellation: randomUUID(),
          conditionPhoto: randomUUID(),
          issueNote: randomUUID(),
          recordReturn: randomUUID(),
          refund: randomUUID(),
          resolveIssue: randomUUID(),
          returnReview: randomUUID(),
          reversals: Object.fromEntries(
            resolutionData.resolution.refunds.map((refund) => [
              refund.refund_record_id,
              randomUUID(),
            ]),
          ),
        }
      : null;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="page-shell py-8 sm:py-12">
        <BookingBackLink />

        {result.status === "error" || result.status === "inconsistent" ? (
          <section
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h1 className="text-2xl font-semibold">
              {result.status === "inconsistent"
                ? "Booking data is incomplete"
                : "Booking unavailable"}
            </h1>
            <p className="mt-2 leading-7">
              {result.status === "inconsistent"
                ? "Required approval or rejection details are missing. Refresh before taking action."
                : "The required booking data could not be loaded. Refresh before making a decision."}
            </p>
            <Link
              className="mt-3 inline-block font-semibold underline"
              href={`/admin/bookings/${bookingId}`}
            >
              Refresh
            </Link>
          </section>
        ) : (
          <>
          <section className="surface mt-6 grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="p-6 sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight">{result.booking.state === "FOR_REVIEW" ? "Review request" : ownerActionTitle(result.booking.state)}</h1>
            <a className="button-primary mt-5" href="#current-owner-action">{result.booking.state === "FOR_REVIEW" ? "Review request" : "View current action"}</a></div>
            <dl className="border-t border-stone-200 bg-[#edf5ff] p-6 lg:border-l lg:border-t-0 sm:p-8"><DetailValue label="Pickup" value={formatManilaDateTime(result.booking.pickupAt)} /><DetailValue label="Return" value={formatManilaDateTime(result.booking.returnAt)} /></dl>
          </section>
          <article className="surface mt-6 p-6 sm:p-8" id="current-owner-action">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {result.booking.camera?.name ?? "Camera unavailable"}
                </h1>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">
                {result.booking.state}
              </span>
            </div>

            <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailValue
                label="Renter legal name"
                value={result.booking.profile?.legalName ?? "Unavailable"}
              />
              <DetailValue
                label="Renter phone"
                value={result.booking.profile?.phone ?? "Unavailable"}
              />
              <DetailValue
                label="Pickup"
                value={formatManilaDateTime(result.booking.pickupAt)}
              />
              <DetailValue
                label="Return"
                value={formatManilaDateTime(result.booking.returnAt)}
              />
              <DetailValue
                label="Requested"
                value={formatManilaDateTime(result.booking.requestedAt)}
              />
              <DetailValue
                label="Expected location"
                value={result.booking.expectedLocation}
              />
            </dl>

            {result.booking.meetup ? (
              <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="admin-meetup-heading">
                <h2 className="text-xl font-semibold" id="admin-meetup-heading">Meetup preference</h2>
                <MeetupDetails meetup={result.booking.meetup} />
                </section>
            ) : null}

            <section className="mt-7 border-t border-stone-200 pt-6">
              <h2 className="text-xl font-semibold">Intended use</h2>
              <PersistedIntendedUse value={result.booking.intendedUse} />
            </section>

            <section className="mt-7 border-t border-stone-200 pt-6">
              <h2 className="text-xl font-semibold">Fixed inclusions</h2>
              {result.booking.accessories.length === 0 ? (
                <p className="mt-3 text-stone-600">No active inclusions.</p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {result.booking.accessories.map((accessory) => (
                    <li className="rounded-xl bg-stone-50 p-4" key={accessory.id}>
                      <span className="font-medium">{accessory.name}</span>
                      <span className="ml-2 text-stone-600">
                        × {accessory.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-7 border-t border-stone-200 pt-6">
              <h2 className="text-xl font-semibold">
                Availability
              </h2>
              {result.booking.availability.length === 0 ? (
                <p className="mt-3 text-stone-600">
                  No conflicts.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {result.booking.availability.map((period) => (
                    <li
                      className="rounded-xl bg-stone-50 p-4 text-sm leading-6"
                      key={`${period.startsAt}-${period.endsAt}`}
                    >
                      {formatManilaDateTime(period.startsAt)} –{" "}
                      {formatManilaDateTime(period.endsAt)}: {period.reason}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {result.booking.state === "FOR_REVIEW" ? (
              <>
                <ApprovalReadinessPanel bookingId={result.booking.id} readiness={result.booking.readiness} />

                {result.booking.quote ? (
                  <section className="mt-7 border-t border-stone-200 pt-6">
                    <h2 className="text-xl font-semibold">
                      Price
                    </h2>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <DetailValue
                        label="Billable days"
                        value={String(result.booking.quote.billableDays)}
                      />
                      <DetailValue
                        label="Daily rate"
                        value={phpFormatter.format(result.booking.quote.dailyRate)}
                      />
                      <DetailValue
                        label="Rental amount"
                        value={phpFormatter.format(
                          result.booking.quote.rentalAmount,
                        )}
                      />
                      <DetailValue
                        label="Security deposit"
                        value={phpFormatter.format(
                          result.booking.quote.securityDeposit,
                        )}
                      />
                      <DetailValue
                        label="Total due"
                        value={phpFormatter.format(result.booking.quote.totalDue)}
                      />
                    </dl>
                  </section>
                ) : null}

                <DecisionControls
                  bookingId={result.booking.id}
                  ready={result.booking.readiness.ready}
                />
              </>
            ) : result.booking.state === "CONTRACT_PENDING" &&
              result.booking.approval ? (
              <section className="mt-7 border-t border-stone-200 pt-6">
                <h2 className="text-xl font-semibold">
                  Approval
                </h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailValue
                    label="Approved (Asia/Manila)"
                    value={formatManilaDateTime(result.booking.approval.approvedAt)}
                  />
                  <DetailValue
                    label="Deadline (Asia/Manila)"
                    value={formatManilaDateTime(
                      result.booking.approval.approvalDeadlineAt,
                    )}
                  />
                  <DetailValue
                    label="Billable days"
                    value={String(result.booking.approval.billableDays)}
                  />
                  <DetailValue
                    label="Daily rate"
                    value={phpFormatter.format(result.booking.approval.dailyRate)}
                  />
                  <DetailValue
                    label="Rental amount"
                    value={phpFormatter.format(
                      result.booking.approval.rentalAmount,
                    )}
                  />
                  <DetailValue
                    label="Security deposit"
                    value={phpFormatter.format(
                      result.booking.approval.securityDeposit,
                    )}
                  />
                  <DetailValue
                    label="Total due"
                    value={phpFormatter.format(result.booking.approval.totalDue)}
                  />
                  <DetailValue
                    label="Currency"
                    value={result.booking.approval.currency}
                  />
                </dl>
              </section>
            ) : result.booking.state === "REJECTED" && result.booking.rejection ? (
              <section className="mt-7 border-t border-stone-200 pt-6">
                <h2 className="text-xl font-semibold">Rejection</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailValue
                    label="Reason"
                    value={result.booking.rejection.reason}
                  />
                  <DetailValue
                    label="Rejected (Asia/Manila)"
                    value={formatManilaDateTime(
                      result.booking.rejection.rejectedAt,
                    )}
                  />
                </dl>
              </section>
            ) : (
              <section
                className="mt-7 border-t border-stone-200 pt-6"
                role="status"
              >
                <h2 className="text-xl font-semibold">Status</h2>
                <p className="mt-2 text-stone-600">No decision is needed.</p>
              </section>
            )}

            {result.booking.approval && contractData ? (
              contractData.status === "success" ? (
                <>
                  <ContractDetails
                    agreement={contractData.agreement}
                    approvalDeadlineAt={
                      result.booking.approval.approvalDeadlineAt
                    }
                  />
                  {(result.booking.state === "CONTRACT_PENDING" ||
                    result.booking.state === "TO_PAY") &&
                  result.booking.camera ? (
                    <SupersedeContractControl
                      bookingId={result.booking.id}
                      cameras={contractData.cameras}
                      currentCameraId={result.booking.camera.id}
                      pickup={formatManilaDateTimeInput(result.booking.pickupAt)}
                      returnValue={formatManilaDateTimeInput(
                        result.booking.returnAt,
                      )}
                    />
                  ) : null}
                </>
              ) : (
                <section
                  className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
                  role="alert"
                >
                  Contract history could not be safely loaded. Replacement
                  controls are disabled; refresh and investigate the persisted
                  record.
                </section>
              )
            ) : null}

            {contractData ? (
              contractData.status === "success" ? (
                <details className="mt-7 rounded-xl border border-stone-200 p-4">
                  <summary className="cursor-pointer font-semibold">
                    Contract audit history
                  </summary>
                  <ol className="mt-4 space-y-3 text-sm leading-6">
                    {contractData.events.map((event) => (
                      <li key={event.auditId}>
                        <span className="font-semibold">
                          Version {event.versionNo} · {event.action}
                        </span>
                        {" · "}
                        {event.outcome} by {event.actorType} ·{" "}
                        {event.actorUserId ?? "system"} ·{" "}
                        {formatManilaDateTime(event.occurredAt)}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : (
                <p className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
                  Contract audit history is temporarily unavailable.
                </p>
              )
            ) : null}

            {pickupData?.status === "success" ? (
              <PickupControls
                actualAt={formatManilaDateTimeInput(new Date().toISOString())}
                operationId={randomUUID()}
                photoIntentId={randomUUID()}
                pickup={pickupData.pickup}
              />
            ) : pickupData ? (
              <p className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
                Pickup eligibility or persisted handoff data could not be loaded. Do not release equipment until it reloads.
              </p>
            ) : null}

            {resolutionData?.status === "success" && resolutionOperationIds ? (
              <ResolutionControls
                actualAt={formatManilaDateTimeInput(
                  new Date().toISOString(),
                  true,
                )}
                operationIds={resolutionOperationIds}
                resolution={resolutionData.resolution}
              />
            ) : resolutionData ? (
              <p className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
                Return, cancellation, and deposit resolution data could not be safely loaded. Do not record a resolution off-system.
              </p>
            ) : null}

          </article>
          </>
        )}
      </main>
    </div>
  );
}

function ownerActionTitle(state: string) {
  if (state === "CONTRACT_PENDING") return "Waiting for renter signature";
  if (state === "TO_PAY" || state === "PAYMENT_REVIEW") return "Review payment";
  if (state === "CONFIRMED") return "Prepare camera handoff";
  if (state === "ACTIVE") return "Prepare for return";
  if (state === "RETURN_REVIEW" || state === "ISSUE_REVIEW") return "Complete return review";
  return "No action required";
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
