import Link from "next/link";
import type { ReactNode } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";

import type { ResolutionQueues } from "./types";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export function ResolutionQueuesPanel({ queues }: { queues: ResolutionQueues }) {
  return (
    <section aria-labelledby="resolution-queues-heading" className="mt-8">
      <h2 className="text-2xl font-semibold" id="resolution-queues-heading">
        Return and resolution queues
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Schedule urgency does not calculate a fee. Deductions and refunds only
        appear after explicit audited decisions or external movements.
      </p>

      <Queue title="Physical returns">
        {queues.return_queue.map((item) => (
          <QueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Expected {formatManilaDateTime(item.expected_return_at)} · {item.urgency.replace("_", " ")}
          </QueueItem>
        ))}
      </Queue>

      <Queue title="Return issues">
        {queues.issue_queue.map((item) => (
          <QueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Damage {item.has_damage ? "yes" : "no"} · missing {item.has_missing_items ? "yes" : "no"} · late {item.late_return ? "yes" : "no"} · {item.evidence_count} private photo{item.evidence_count === 1 ? "" : "s"}
          </QueueItem>
        ))}
      </Queue>

      <Queue title="Cancellation requests">
        {queues.cancellation_queue.map((item) => (
          <QueueItem
            bookingId={item.booking_id}
            key={item.request_id}
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            {item.booking_state} · acceptance {item.acceptance_enabled ? "enabled" : "policy-disabled"} · “{item.reason}”
          </QueueItem>
        ))}
      </Queue>

      <Queue title="Deposit liabilities">
        {queues.deposit_queue.map((item) => (
          <QueueItem
            bookingId={item.booking_id}
            key={item.booking_id}
            summary={`${item.renter_legal_name} · ${item.camera_name}`}
          >
            Held {phpFormatter.format(item.held_amount)} · deducted {phpFormatter.format(item.deduction_amount)} · refunded {phpFormatter.format(item.refunded_amount)} · remaining {phpFormatter.format(item.remaining_refund_liability)}
          </QueueItem>
        ))}
      </Queue>
    </section>
  );
}

function Queue({ children, title }: { children: ReactNode; title: string }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">No items.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">{children}</ul>
      )}
    </div>
  );
}

function QueueItem({
  bookingId,
  children,
  summary,
}: {
  bookingId: string;
  children: ReactNode;
  summary: string;
}) {
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="font-semibold">{summary}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{children}</p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={`/admin/bookings/${bookingId}`}>Open audited resolution</Link>
    </li>
  );
}
