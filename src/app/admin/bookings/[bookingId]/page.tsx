import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionControls } from "@/features/bookings/admin/decision-controls";
import { loadAdminBookingDetail } from "@/features/bookings/admin/data";
import type { ApprovalReadinessReason } from "@/features/bookings/admin/readiness";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { PersistedIntendedUse } from "@/features/bookings/components/persisted-intended-use";
import {
  formatManilaDateTime,
  formatManilaDateTimeInput,
} from "@/features/bookings/manila-time";
import { ContractDetails } from "@/features/contracts/components/contract-details";
import { SupersedeContractControl } from "@/features/contracts/components/supersede-contract-control";
import {
  loadAdminContractContext,
} from "@/features/contracts/data";
import { requirePageAdmin } from "@/lib/auth/require-admin";
import { loadPickupDetail } from "@/features/pickup/data";
import { PickupControls } from "@/features/pickup/pickup-controls";
import { loadResolutionDetail } from "@/features/resolution/data";
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

const readinessMessages: Record<ApprovalReadinessReason, string> = {
  availability_overlap:
    "The requested period overlaps current sanitized availability.",
  camera_unavailable:
    "The camera is not published and active with complete pricing.",
  profile_inactive: "The renter profile is not active.",
  quote_unavailable: "The authoritative quote could not be obtained.",
  template_invalid:
    "The active contract template is missing required terms.",
  template_unavailable: "No active approved contract template is available.",
};

type AdminBookingPageProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function AdminBookingPage({ params }: AdminBookingPageProps) {
  const { bookingId } = await params;
  const context = await requirePageAdmin(`/admin/bookings/${bookingId}`);
  const result = await loadAdminBookingDetail(context, bookingId);

  if (result.status === "missing") notFound();

  const [pickupData, resolutionData, contractData] = await Promise.all([
    result.status === "success" &&
    (result.booking.state === "CONFIRMED" || result.booking.state === "ACTIVE")
      ? loadPickupDetail(context, bookingId)
      : Promise.resolve(null),
    result.status === "success"
      ? loadResolutionDetail(context, bookingId)
      : Promise.resolve(null),
    result.status === "success" && result.booking.approval
      ? loadAdminContractContext(
          context,
          result.booking.id,
          result.booking.approval.currentContractVersionId,
        )
      : Promise.resolve(null),
  ]);
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
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          className="inline-flex min-h-11 items-center font-medium text-amber-900 underline decoration-amber-300 underline-offset-4"
          href="/admin"
        >
          ← Back to review queue
        </Link>

        {result.status === "error" || result.status === "inconsistent" ? (
          <section
            className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h1 className="text-2xl font-semibold">
              {result.status === "inconsistent"
                ? "Persisted outcome is incomplete"
                : "Booking unavailable"}
            </h1>
            <p className="mt-2 leading-7">
              {result.status === "inconsistent"
                ? "The stored state is missing required approval or rejection evidence. Do not make another decision; refresh and investigate the persisted record."
                : "The required booking data could not be loaded. Refresh before making a decision."}
            </p>
            <Link
              className="mt-3 inline-block font-semibold underline"
              href={`/admin/bookings/${bookingId}`}
            >
              Refresh persisted state
            </Link>
          </section>
        ) : (
          <article className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
                  Persisted admin review
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                  {result.booking.camera?.name ?? "Camera unavailable"}
                </h1>
                <p className="mt-2 break-all text-xs text-stone-500">
                  Booking {result.booking.id}
                </p>
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
                label="Profile status"
                value={result.booking.profile?.accountStatus ?? "Unavailable"}
              />
              <DetailValue
                label="Pickup (Asia/Manila)"
                value={formatManilaDateTime(result.booking.pickupAt)}
              />
              <DetailValue
                label="Return (Asia/Manila)"
                value={formatManilaDateTime(result.booking.returnAt)}
              />
              <DetailValue
                label="Requested (Asia/Manila)"
                value={formatManilaDateTime(result.booking.requestedAt)}
              />
              <DetailValue
                label="Expected location"
                value={result.booking.expectedLocation}
              />
            </dl>

            {result.booking.meetup ? (
              <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="admin-meetup-heading">
                <h2 className="text-xl font-semibold" id="admin-meetup-heading">Planned pickup and return meetup</h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailValue label="Renter city" value={result.booking.meetup.renterCity} />
                  <DetailValue label="Public venue" value={result.booking.meetup.name} />
                  <DetailValue label="Venue address" value={result.booking.meetup.address} />
                  <DetailValue label="Venue city" value={result.booking.meetup.city} />
                </dl>
                <p className="mt-3 text-xs text-stone-500">{result.booking.meetup.attribution}</p>
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
                Availability for requested interval
              </h2>
              {result.booking.availability.length === 0 ? (
                <p className="mt-3 text-stone-600">
                  No conflicting sanitized availability period overlaps this
                  request.
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
                <section
                  className="mt-7 border-t border-stone-200 pt-6"
                  aria-labelledby="readiness-heading"
                >
                  <h2 className="text-xl font-semibold" id="readiness-heading">
                    Approval readiness
                  </h2>
                  <p
                    className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${
                      result.booking.readiness.ready
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-red-200 bg-red-50 text-red-900"
                    }`}
                    role="status"
                  >
                    {result.booking.readiness.ready
                      ? "Advisory checks pass. The approval RPC will recheck every condition atomically."
                      : "Approval is blocked in the interface. Review the unmet conditions below."}
                  </p>
                  {result.booking.readiness.reasons.length > 0 ? (
                    <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-red-900">
                      {result.booking.readiness.reasons.map((reason) => (
                        <li key={reason}>{readinessMessages[reason]}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                {result.booking.quote ? (
                  <section className="mt-7 border-t border-stone-200 pt-6">
                    <h2 className="text-xl font-semibold">
                      Current authoritative estimate
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      This is advisory. Approval recalculates from stored booking
                      instants and current camera rates.
                    </p>
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
                      <DetailValue
                        label="Currency"
                        value={result.booking.quote.currency}
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
                  Persisted approval result
                </h2>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  The booking is contract-pending. These are immutable stored
                  pricing snapshots and the safe contract-version reference.
                </p>
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
                  <DetailValue
                    label="Current contract version"
                    value={result.booking.approval.currentContractVersionId}
                  />
                  <DetailValue
                    label="Contract reference"
                    value={`Version ${result.booking.approval.contractReference.versionNo} · ${result.booking.approval.contractReference.status} · issued ${formatManilaDateTime(result.booking.approval.contractReference.issuedAt)}`}
                  />
                </dl>
              </section>
            ) : result.booking.state === "REJECTED" && result.booking.rejection ? (
              <section className="mt-7 border-t border-stone-200 pt-6">
                <h2 className="text-xl font-semibold">Persisted rejection result</h2>
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
                <h2 className="text-xl font-semibold">Current persisted state</h2>
                <p className="mt-2 leading-7 text-stone-600">
                  This booking is no longer awaiting review. Decision controls
                  are unavailable; use the displayed persisted state as the
                  current outcome.
                </p>
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

            <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Verification decisions/uploads, private document reads, contract
              renter signing, paid-cancellation acceptance, and public launch
              remain subject to their separate approvals. Pickup and return
              controls never authorize Production ID collection or paid public
              launch.
            </section>
          </article>
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
