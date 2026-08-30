import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { loadPaymentReviewDetail } from "@/features/payments/data";
import { PaymentReviewControls } from "@/features/payments/payment-review-controls";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin payment reconciliation | CamNook",
};

type PageProps = { params: Promise<{ paymentId: string }> };

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;
}

export default async function AdminPaymentPage({ params }: PageProps) {
  const { paymentId } = await params;
  const context = await requirePageAdmin(`/admin/payments/${paymentId}`);
  const result = await loadPaymentReviewDetail(context, paymentId);

  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline underline-offset-4" href="/admin">
          ← Back to review queues
        </Link>

        {result.status === "error" || result.status === "stale" ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h1 className="text-2xl font-semibold">
              {result.status === "stale" ? "Payment is no longer pending" : "Payment unavailable"}
            </h1>
            <p className="mt-2 leading-7">
              {result.status === "stale"
                ? "Another operation changed the current payment or booking. Return to the queue to inspect the persisted outcome."
                : "The safe reconciliation projection or audit history could not be loaded. Do not make a decision until it is available."}
            </p>
          </section>
        ) : (
          <article className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Manual GCash reconciliation</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">{result.item.renter_legal_name}</h1>
                <p className="mt-2 text-stone-600">{result.item.camera_name}</p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-950">PAYMENT_REVIEW</span>
            </div>

            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Reconcile only against the actual transfer in the approved GCash
              account shown below. Proof is optional supporting evidence and is
              never sufficient by itself.
            </p>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Declared amount" value={phpFormatter.format(result.item.declared_amount)} />
              <Detail label="Authoritative total" value={phpFormatter.format(result.item.total_due)} />
              <Detail label="Rental allocation" value={phpFormatter.format(result.item.rental_amount)} />
              <Detail label="Security-deposit allocation" value={phpFormatter.format(result.item.security_deposit)} />
              <Detail label="Submitted sender" value={result.item.sender_name} />
              <Detail label="Submitted reference" value={result.item.reference} />
              <Detail label="Approved recipient" value={result.item.recipient_name} />
              <Detail label="Approved GCash account" value={result.item.recipient_account} />
              <Detail label="Submitted (Asia/Manila)" value={formatManilaDateTime(result.item.submitted_at)} />
              <Detail label="Original deadline (unchanged)" value={formatManilaDateTime(result.item.approval_deadline_at)} />
              <Detail
                label="Private proof"
                value={result.item.proof ? `${result.item.proof.media_type} · ${formatBytes(result.item.proof.byte_size)}` : "Not attached"}
              />
              <Detail label="Currency" value={result.item.currency} />
            </dl>
            <p className="mt-4 text-xs text-stone-500">
              This projection omits proof paths, signed URLs, digests, unrelated
              renter fields, and unrelated financial records.
            </p>

            <PaymentReviewControls
              hasProof={result.item.proof !== null}
              paymentId={result.item.transaction_id}
              proofId={result.item.proof?.proof_id}
            />

            <section className="mt-8 border-t border-stone-200 pt-7" aria-labelledby="payment-audit-heading">
              <h2 className="text-xl font-semibold" id="payment-audit-heading">Append-only audit history</h2>
              {result.audit.length === 0 ? (
                <p className="mt-3 text-sm text-stone-600">No projected payment audit events are available.</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {result.audit.map((entry) => (
                    <li className="rounded-xl bg-stone-50 p-4 text-sm" key={entry.audit_id}>
                      <p className="font-medium">{entry.action} · {entry.outcome}</p>
                      <p className="mt-1 text-stone-600">{formatManilaDateTime(entry.occurred_at)} · {entry.purpose}</p>
                      <p className="mt-1 break-all text-xs text-stone-500">
                        Actor: {entry.actor_user_id ?? "System"} · Transaction: {entry.transaction_id} · Operation: {entry.operation_id}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </article>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
