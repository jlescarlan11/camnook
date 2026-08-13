import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionControls } from "@/features/bookings/admin/decision-controls";
import { loadAdminBookingDetail } from "@/features/bookings/admin/data";
import type { ApprovalReadinessReason } from "@/features/bookings/admin/readiness";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { PersistedIntendedUse } from "@/features/bookings/components/persisted-intended-use";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { requirePageAdmin } from "@/lib/auth/require-admin";

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
  verification_expired:
    "The latest verified document expired before today in Manila.",
  verification_missing: "No verification record is available.",
  verification_not_verified:
    "The latest verification record is not verified.",
};

type AdminBookingPageProps = {
  params: Promise<{ bookingId: string }>;
};

export default async function AdminBookingPage({ params }: AdminBookingPageProps) {
  const { bookingId } = await params;
  const context = await requirePageAdmin(`/admin/bookings/${bookingId}`);
  const result = await loadAdminBookingDetail(context, bookingId);

  if (result.status === "missing") notFound();

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
              <h2 className="text-xl font-semibold">Verification metadata</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Metadata only. Identity documents and private Storage remain
                inaccessible from this flow.
              </p>
              {result.booking.latestVerification ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailValue
                    label="Latest status"
                    value={result.booking.latestVerification.status}
                  />
                  <DetailValue
                    label="ID type"
                    value={result.booking.latestVerification.idType}
                  />
                  <DetailValue
                    label="Expiration (Manila date)"
                    value={
                      result.booking.latestVerification.documentExpirationDate ??
                      "Unavailable"
                    }
                  />
                  <DetailValue
                    label="Submitted (Asia/Manila)"
                    value={formatManilaDateTime(
                      result.booking.latestVerification.submittedAt,
                    )}
                  />
                </dl>
              ) : (
                <p className="mt-4 text-stone-600">No verification metadata.</p>
              )}
            </section>

            <section className="mt-7 border-t border-stone-200 pt-6">
              <h2 className="text-xl font-semibold">Current availability context</h2>
              {result.booking.availability.length === 0 ? (
                <p className="mt-3 text-stone-600">
                  No sanitized availability periods are currently listed.
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

            <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Verification decisions/uploads, private document reads, contract
              signing/PDFs, payments, cancellation, handoff, refunds, and public
              launch remain disabled in this admin flow.
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
