import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { nextManilaBusinessDate } from "@/features/verification/admin-date";
import { loadVerificationReviewDetail } from "@/features/verification/admin-data";
import { VerificationReviewControls } from "@/features/verification/admin-review-controls";
import {
  ACCEPTED_ID_TYPES,
  ID_TYPE_LABELS,
} from "@/features/verification/types";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin identity review | CamNook",
};

type PageProps = { params: Promise<{ verificationId: string }> };

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;
}

export default async function AdminVerificationPage({ params }: PageProps) {
  const { verificationId } = await params;
  const context = await requirePageAdmin(
    `/admin/verifications/${verificationId}`,
  );
  const result = await loadVerificationReviewDetail(context, verificationId);

  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          className="inline-flex min-h-11 items-center font-medium text-amber-900 underline underline-offset-4"
          href="/admin"
        >
          ← Back to review queue
        </Link>

        {result.status === "error" ? (
          <section
            className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h1 className="text-2xl font-semibold">Submission unavailable</h1>
            <p className="mt-2 leading-7">
              The current safe review metadata could not be loaded. Do not
              request evidence or record a decision until it is available.
            </p>
          </section>
        ) : (
          <article className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
                  Audited identity review
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                  {result.item.renter_legal_name}
                </h1>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-950">
                Pending
              </span>
            </div>

            <p className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              Review only the renter’s name, portrait, document type, and
              expiration date. Ignore and do not record any inadvertently
              visible information.
            </p>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Renter legal name" value={result.item.renter_legal_name} />
              <Detail
                label="Submitted ID type"
                value={ID_TYPE_LABELS[result.item.id_type]}
              />
              <Detail
                label="Submitted (Asia/Manila)"
                value={formatManilaDateTime(result.item.submitted_at)}
              />
              <Detail
                label="Evidence format"
                value={`${result.item.media_type} · ${formatBytes(result.item.byte_size)}`}
              />
              <Detail
                label="Evidence retention deadline"
                value={formatManilaDateTime(result.item.retention_until)}
              />
            </dl>
            <p className="mt-4 text-xs text-stone-500">
              The queue and this page omit object paths, digests, tokens, ID
              numbers, phone numbers, and unrelated profile fields.
            </p>

            <VerificationReviewControls
              allowedIdTypes={ACCEPTED_ID_TYPES}
              minimumExpirationDate={nextManilaBusinessDate()}
              recordId={result.item.record_id}
            />
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
