import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { loadPaymentReviewDetail } from "@/features/payments/data";
import { PaymentReviewControls } from "@/features/payments/payment-review-controls";
import { getAdminStatus } from "@/lib/auth/require-admin";
import { requirePageUser } from "@/lib/auth/require-user";

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
  const context = await requirePageUser(`/admin/payments/${paymentId}`);
  if (!z.uuid().safeParse(paymentId).success) {
    if (!(await getAdminStatus(context))) redirect("/forbidden");
    notFound();
  }
  const result = await loadPaymentReviewDetail(context, paymentId);

  if (result.status === "forbidden") redirect("/forbidden");
  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline underline-offset-4" href="/admin">
          ← Back to review queues
        </Link>

        {result.status === "error" || result.status === "stale" ? (
          <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
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
          <article className="mt-6 rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#0b4f9c]">GCash review</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{result.item.renter_legal_name}</h1>
                <p className="mt-2 text-stone-600">{result.item.camera_name}</p>
              </div>
              <span className="status-pill">Needs review</span>
            </div>

            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Confirm the transfer in GCash. The uploaded proof alone is not confirmation.
            </p>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Declared amount" value={phpFormatter.format(result.item.declared_amount)} />
              <Detail label="Amount due" value={phpFormatter.format(result.item.total_due)} />
              <Detail label="Sender" value={result.item.sender_name} />
              <Detail label="Reference" value={result.item.reference} />
              <Detail label="Recipient" value={`${result.item.recipient_name} · ${result.item.recipient_account}`} />
              <Detail label="Submitted" value={formatManilaDateTime(result.item.submitted_at)} />
              <Detail
                label="Private proof"
                value={result.item.proof ? `${result.item.proof.media_type} · ${formatBytes(result.item.proof.byte_size)}` : "Not attached"}
              />
            </dl>

            <PaymentReviewControls
              hasProof={result.item.proof !== null}
              paymentId={result.item.transaction_id}
              proofId={result.item.proof?.proof_id}
            />

            <details className="mt-8 border-t border-stone-200 pt-7">
              <summary className="cursor-pointer text-lg font-semibold text-[#0b4f9c]" id="payment-audit-heading">History</summary>
              {result.audit.length === 0 ? (
                <p className="mt-3 text-sm text-stone-600">No projected payment audit events are available.</p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {result.audit.map((entry) => (
                    <li className="rounded-xl bg-stone-50 p-4 text-sm" key={entry.audit_id}>
                      <p className="font-medium">{entry.action} · {entry.outcome}</p>
                      <p className="mt-1 text-stone-600">{formatManilaDateTime(entry.occurred_at)} · {entry.purpose}</p>
                    </li>
                  ))}
                </ol>
              )}
            </details>
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
