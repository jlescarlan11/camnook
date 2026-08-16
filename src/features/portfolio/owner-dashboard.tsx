import Link from "next/link";
import type { ReactNode } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";

import type {
  OwnerOperationsDashboard,
  OwnerPortfolioReport,
} from "./types";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

const percentageFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const requiredQueueLinks = [
  ["review", "Booking review"],
  ["signature", "Contract signature"],
  ["payment", "Payment review"],
  ["pickup", "Pickup"],
  ["active_rental", "Active rental"],
  ["return", "Physical return"],
  ["issue_review", "Issue review"],
  ["held_deposit", "Held deposits"],
  ["pending_refund", "Pending refunds"],
] as const;

export function OwnerOperationsPanel({
  dashboard,
}: {
  dashboard: OwnerOperationsDashboard;
}) {
  const { queues } = dashboard;

  return (
    <>
      <section className="mt-8" aria-labelledby="operations-summary-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold" id="operations-summary-heading">
              Current operations
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Each count and item comes from the same database snapshot. An
              unavailable projection is never shown as an empty queue.
            </p>
          </div>
          <p className="text-sm text-stone-500">
            As of {formatManilaDateTime(dashboard.generated_at)}
          </p>
        </div>
        <nav
          aria-label="Operations queue summary"
          className="mt-5 grid gap-3 sm:grid-cols-3"
        >
          {requiredQueueLinks.map(([key, label]) => (
            <a
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-amber-400"
              href={`#queue-${key}`}
              key={key}
            >
              <span className="block text-2xl font-semibold">
                {dashboard.queue_counts[key]}
              </span>
              <span className="mt-1 block text-sm text-stone-600">{label}</span>
            </a>
          ))}
        </nav>
      </section>

      <DepositReconciliation dashboard={dashboard} />

      <QueueSection
        count={dashboard.queue_counts.review}
        description="Persisted FOR_REVIEW requests, oldest request first."
        empty="No booking requests await review."
        id="review"
        title="Booking review"
      >
        {queues.review.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel="Review request"
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Pickup {formatManilaDateTime(item.pickup_at)} · requested{" "}
            {formatManilaDateTime(item.requested_at)} · {urgencyLabel(item.urgency)}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.signature}
        description="Current CONTRACT_PENDING bookings only. The immutable approval deadline is classified against the database clock."
        empty="No contracts await signature."
        id="signature"
        title="Contract signature"
      >
        {queues.signature.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel="Open contract"
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            {item.renter_phone} · deadline{" "}
            {formatManilaDateTime(item.approval_deadline_at)} ·{" "}
            {urgencyLabel(item.urgency)}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.payment}
        description="Current submitted transfers only, oldest first. Broad queue data excludes sender and full transfer references."
        empty="No payments await reconciliation."
        id="payment"
        title="Payment review"
      >
        {queues.payment.map((item) => (
          <li
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
            key={item.transaction_id}
          >
            <p className="font-semibold">
              {item.renter_legal_name} · {item.camera_name}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {phpFormatter.format(item.declared_amount)} · submitted{" "}
              {formatManilaDateTime(item.submitted_at)} · {queueAge(item.age_seconds)} ·{" "}
              {item.urgency === "overdue" ? "12-hour target exceeded" : "open"}
            </p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4"
              href={`/admin/payments/${item.transaction_id}`}
            >
              Reconcile payment
            </Link>
          </li>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.pickup}
        description="Eligible CONFIRMED bookings only; identity, current contract, and verified payment are rechecked in PostgreSQL."
        empty="No bookings are ready for pickup."
        id="pickup"
        title="Pickup"
      >
        {queues.pickup.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel="Complete pickup checklist"
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Pickup {formatManilaDateTime(item.pickup_at)} · return{" "}
            {formatManilaDateTime(item.return_at)} · {item.accessory_count} inclusion
            {item.accessory_count === 1 ? "" : "s"}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.active_rental}
        description="Current ACTIVE bookings, ordered by expected return. Urgency is schedule-only and never creates an automatic charge."
        empty="No rentals are active."
        id="active_rental"
        title="Active rental"
      >
        {queues.active_rental.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel="View active rental"
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            {item.renter_phone} · expected {formatManilaDateTime(item.expected_return_at)} ·{" "}
            {urgencyLabel(item.urgency)}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.return}
        description="ACTIVE rentals needing a physical return and RETURN_REVIEW handoffs needing an inspection decision."
        empty="No physical returns need action."
        id="return"
        title="Physical return"
      >
        {queues.return.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel={
              item.stage === "awaiting_return" ? "Record return" : "Review inspection"
            }
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Expected {formatManilaDateTime(item.expected_return_at)} ·{" "}
            {item.stage === "inspection_review" ? "inspection recorded" : urgencyLabel(item.urgency)}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <QueueSection
        count={dashboard.queue_counts.issue_review}
        description="Current ISSUE_REVIEW bookings, with evidence counts but no private evidence locations or decision notes."
        empty="No return issues await a decision."
        id="issue_review"
        title="Issue review"
      >
        {queues.issue_review.map((item) => (
          <BookingQueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            linkLabel="Open issue review"
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Damage {yesNo(item.has_damage)} · missing items{" "}
            {yesNo(item.has_missing_items)} · late {yesNo(item.late_return)} ·{" "}
            {item.evidence_count} private photo{item.evidence_count === 1 ? "" : "s"}
          </BookingQueueItem>
        ))}
      </QueueSection>

      <DepositQueue
        count={dashboard.queue_counts.held_deposit}
        description="Non-terminal bookings with a verified deposit balance still held."
        empty="No active bookings have a held-deposit liability."
        id="held_deposit"
        items={queues.held_deposit}
        title="Held deposits"
      />
      <DepositQueue
        count={dashboard.queue_counts.pending_refund}
        description="Terminal bookings whose immutable deposit ledger still has an actionable refund liability."
        empty="No refunds are pending."
        id="pending_refund"
        items={queues.pending_refund}
        title="Pending refunds"
      />

      <SupportingQueues dashboard={dashboard} />
    </>
  );
}

export function OwnerPortfolioPanel({
  invalidPeriod,
  period,
  report,
}: {
  invalidPeriod: boolean;
  period: { endDateExclusive: string; startDate: string };
  report: OwnerPortfolioReport | null;
}) {
  return (
    <section className="mt-12 border-t border-stone-300 pt-10" aria-labelledby="portfolio-heading">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
            Owner-only financials
          </p>
          <h2 className="mt-2 text-3xl font-semibold" id="portfolio-heading">
            Portfolio performance
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Manila calendar dates use a half-open interval: start included, end
            excluded. Deposits, deductions, refunds, and unverified transfers
            never count as rental revenue.
          </p>
        </div>
        <form className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]" method="get">
          <label className="text-sm font-medium text-stone-700">
            Start date
            <input
              className="mt-1 block min-h-11 rounded-lg border border-stone-300 px-3"
              defaultValue={period.startDate}
              name="start"
              required
              type="date"
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            End date (excluded)
            <input
              className="mt-1 block min-h-11 rounded-lg border border-stone-300 px-3"
              defaultValue={period.endDateExclusive}
              name="end"
              required
              type="date"
            />
          </label>
          <button
            className="min-h-11 self-end rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white"
            type="submit"
          >
            Apply period
          </button>
        </form>
      </div>

      {invalidPeriod ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
          Enter valid dates with the excluded end date after the start date.
          No fallback financial report was loaded.
        </div>
      ) : report === null ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
          Portfolio metrics are unavailable. Do not treat missing data as zero;
          reload before using this page for reporting.
        </div>
      ) : (
        <PortfolioReport report={report} />
      )}
    </section>
  );
}

function DepositReconciliation({
  dashboard,
}: {
  dashboard: OwnerOperationsDashboard;
}) {
  const totals = dashboard.deposit_reconciliation;
  return (
    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6" aria-labelledby="deposit-reconciliation-heading">
      <h2 className="text-xl font-semibold" id="deposit-reconciliation-heading">
        Deposit liability reconciliation
      </h2>
      <p className="mt-2 text-sm leading-6 text-amber-950/80">
        Verified deposits − approved deductions − net externally recorded refunds
        equals remaining liability. Reversals offset their original entry once.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Verified deposits" value={phpFormatter.format(totals.verified_deposit_total)} />
        <Metric label="Approved deductions" value={phpFormatter.format(totals.approved_deduction_total)} />
        <Metric label="Net external refunds" value={phpFormatter.format(totals.externally_refunded_total)} />
        <Metric label="Held liability" value={phpFormatter.format(totals.held_liability_total)} />
        <Metric label="Pending refunds" value={phpFormatter.format(totals.pending_refund_total)} />
        <Metric label="Remaining liability" value={phpFormatter.format(totals.remaining_liability_total)} />
      </dl>
    </section>
  );
}

function DepositQueue({
  count,
  description,
  empty,
  id,
  items,
  title,
}: {
  count: number;
  description: string;
  empty: string;
  id: string;
  items: OwnerOperationsDashboard["queues"]["held_deposit"];
  title: string;
}) {
  return (
    <QueueSection count={count} description={description} empty={empty} id={id} title={title}>
      {items.map((item) => (
        <BookingQueueItem
          bookingId={item.booking_id}
          key={item.booking_id}
          linkLabel="Open audited resolution"
          summary={`${item.renter_legal_name} · ${item.camera_name}`}
        >
          Held {phpFormatter.format(item.held_amount)} · deducted{" "}
          {phpFormatter.format(item.deduction_amount)} · net refunded{" "}
          {phpFormatter.format(item.refunded_amount)} · remaining{" "}
          {phpFormatter.format(item.remaining_liability)}
        </BookingQueueItem>
      ))}
    </QueueSection>
  );
}

function SupportingQueues({
  dashboard,
}: {
  dashboard: OwnerOperationsDashboard;
}) {
  return (
    <section className="mt-10" aria-labelledby="supporting-queues-heading">
      <h2 className="text-2xl font-semibold" id="supporting-queues-heading">
        Supporting compliance and cancellation work
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Online government-ID review is retired. Cancellation review remains
        reachable while broad responses omit free-form cancellation reasons.
      </p>
      <div className="mt-5 grid gap-5">
        <SupportingList
          empty="No cancellation requests await review."
          title={`Cancellation review (${dashboard.supporting_queue_counts.cancellation})`}
        >
          {dashboard.supporting_queues.cancellation.map((item) => (
            <li className="rounded-xl bg-stone-50 p-4" key={item.request_id}>
              <p className="font-semibold">
                {item.renter_legal_name} · {item.camera_name}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {item.booking_state} · requested {formatManilaDateTime(item.requested_at)}
              </p>
              <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={`/admin/bookings/${item.booking_id}`}>
                Review cancellation
              </Link>
            </li>
          ))}
        </SupportingList>
      </div>
    </section>
  );
}

function PortfolioReport({ report }: { report: OwnerPortfolioReport }) {
  const portfolio = report.portfolio;
  return (
    <>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net verified rental revenue" value={phpFormatter.format(portfolio.period_net_verified_rental_revenue)} />
        <Metric label="Rental utilization" value={formatPercent(portfolio.rental_utilization_percent)} />
        <Metric label="Maintenance" value={formatDuration(portfolio.maintenance_seconds)} />
        <Metric label="Manual unavailability" value={formatDuration(portfolio.manual_unavailable_seconds)} />
      </dl>
      <p className="mt-4 text-sm leading-6 text-stone-600">
        {report.period.start_date} through {report.period.end_date_exclusive} (end excluded), Asia/Manila. Rental intervals are scheduled pickup-to-return for CONFIRMED through COMPLETED states and are unioned before duration so overlaps count once. Camera denominator windows run from creation to archive.
      </p>

      {report.cameras.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 text-stone-600">
          No serialized cameras are recorded.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <TableHeading>Camera</TableHeading>
                <TableHeading>Period revenue</TableHeading>
                <TableHeading>Utilization</TableHeading>
                <TableHeading>Maintenance / manual</TableHeading>
                <TableHeading>Acquisition cost</TableHeading>
                <TableHeading>Lifetime net revenue</TableHeading>
                <TableHeading>Cost recovery</TableHeading>
              </tr>
            </thead>
            <tbody>
              {report.cameras.map((camera) => (
                <tr className="border-t border-stone-200 align-top" key={camera.camera_id}>
                  <TableCell>
                    <span className="font-semibold">{camera.camera_name}</span>
                    <span className="mt-1 block capitalize text-stone-500">{camera.camera_status}</span>
                  </TableCell>
                  <TableCell>{phpFormatter.format(camera.period_net_verified_rental_revenue)}</TableCell>
                  <TableCell>
                    {formatPercent(camera.rental_utilization_percent)}
                    <span className="mt-1 block text-stone-500">
                      {formatDuration(camera.rental_utilized_seconds)} of {formatDuration(camera.inventory_window_seconds)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {formatDuration(camera.maintenance_seconds)} / {formatDuration(camera.manual_unavailable_seconds)}
                  </TableCell>
                  <TableCell>
                    {camera.acquisition_cost === null || camera.acquisition_cost === 0
                      ? "Unavailable"
                      : phpFormatter.format(camera.acquisition_cost)}
                  </TableCell>
                  <TableCell>{phpFormatter.format(camera.lifetime_net_verified_rental_revenue)}</TableCell>
                  <TableCell>
                    {camera.cost_recovery.status === "unavailable" ? (
                      "Unavailable"
                    ) : (
                      <>
                        {formatPercent(camera.cost_recovery.recovery_percent)}
                        <span className="mt-1 block text-stone-500">
                          {phpFormatter.format(camera.cost_recovery.recovered_amount)} recovered · {phpFormatter.format(camera.cost_recovery.remaining_amount)} remaining
                        </span>
                      </>
                    )}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function QueueSection({
  children,
  count,
  description,
  empty,
  id,
  title,
}: {
  children: ReactNode;
  count: number;
  description: string;
  empty: string;
  id: string;
  title: string;
}) {
  return (
    <section className="mt-9 scroll-mt-6" id={`queue-${id}`} aria-labelledby={`queue-${id}-heading`}>
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-semibold" id={`queue-${id}-heading`}>{title}</h2>
        <span className="rounded-full bg-stone-200 px-2.5 py-1 text-sm font-semibold">{count}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      {count === 0 ? (
        <p className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 text-stone-600" role="status">{empty}</p>
      ) : (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2">{children}</ul>
      )}
    </section>
  );
}

function BookingQueueItem({
  bookingId,
  children,
  linkLabel,
  summary,
}: {
  bookingId: string;
  children: ReactNode;
  linkLabel: string;
  summary: string;
}) {
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="font-semibold">{summary}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{children}</p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href={`/admin/bookings/${bookingId}`}>
        {linkLabel}
      </Link>
    </li>
  );
}

function SupportingList({ children, empty, title }: { children: ReactNode; empty: string; title: string }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      {hasItems ? <ul className="mt-3 space-y-3">{children}</ul> : <p className="mt-3 text-sm text-stone-600">{empty}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold">{value}</dd>
    </div>
  );
}

function TableHeading({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold" scope="col">{children}</th>;
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-4">{children}</td>;
}

function urgencyLabel(urgency: string) {
  if (urgency === "expired") return "Expired — act now";
  if (urgency === "overdue") return "Overdue — act now";
  if (urgency === "due_today") return "Due today";
  if (urgency === "open") return "Open";
  return "Upcoming";
}

function queueAge(seconds: number) {
  if (seconds < 60) return "less than a minute";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr`;
  return `${Math.floor(seconds / 86_400)} days`;
}

function formatPercent(value: number | null) {
  return value === null ? "Unavailable" : `${percentageFormatter.format(value)}%`;
}

function formatDuration(seconds: number) {
  if (seconds === 0) return "0 hours";
  const hours = seconds / 3600;
  if (hours < 24) return `${percentageFormatter.format(hours)} hr`;
  return `${percentageFormatter.format(hours / 24)} days`;
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}
