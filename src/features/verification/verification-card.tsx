"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

import {
  requestVerificationEvidenceDeletion,
  submitVerificationEvidence,
  type VerificationDeletionActionState,
  type VerificationUploadActionState,
} from "./actions";
import {
  ID_TYPE_LABELS,
  type AcceptedIdType,
  type VerificationState,
} from "./types";

const initialUploadState: VerificationUploadActionState = { status: "idle" };
const initialDeletionState: VerificationDeletionActionState = { status: "idle" };

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;
}

function uploadErrorMessage(error: VerificationUploadActionState["error"]) {
  switch (error) {
    case "policy_unavailable":
      return "Government ID uploads are temporarily unavailable because the privacy gate is not active.";
    case "privacy_not_accepted":
      return "Read the privacy notice and check the acknowledgement before uploading.";
    case "restart_required":
      return "We could not safely finish this attempt. Retry with the same file; CamNook will reconcile or clean up the earlier attempt first.";
    case "suspended":
      return "This account is suspended and cannot upload verification evidence.";
    case "upload_failed":
      return "The stored file could not be verified. The attempt was closed or queued for cleanup; retry with the original file.";
    default:
      return "Correct the highlighted fields and try again.";
  }
}

export function VerificationCard({ state }: { state: VerificationState }) {
  const [uploadState, uploadAction, uploadPending] = useActionState(
    submitVerificationEvidence,
    initialUploadState,
  );
  const [deletionState, deletionAction, deletionPending] = useActionState(
    requestVerificationEvidenceDeletion,
    initialDeletionState,
  );
  const [clientFileError, setClientFileError] = useState<string>();
  const policy = state.policy;
  const document = state.document;
  const record = state.record;
  const canUpload = policy.enabled && record?.status !== "verified";
  const acceptedIdTypes = policy.allowed_id_types as AcceptedIdType[];

  return (
    <section
      aria-labelledby="verification-heading"
      className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
            Private evidence
          </p>
          <h2 className="mt-2 text-2xl font-semibold" id="verification-heading">
            Government ID verification
          </h2>
        </div>
        {record ? (
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stone-700">
            {record.status}
          </span>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-amber-950">Privacy notice — read before uploading</h3>
        <div className="mt-3 space-y-3 text-sm leading-6 text-amber-950">
          <p>
            <strong>Purpose.</strong> CamNook collects one government ID image or PDF to confirm the renter’s identity and reduce fraud before a rental decision. Do not enter or upload a separate full ID number.
          </p>
          <p>
            <strong>Access.</strong> The file stays in private Storage. You may retrieve your own current file. Sprint 1 grants no staff access to raw ID bytes; any future reviewer access must be separately approved, purpose-limited, time-limited, and audited.
          </p>
          <p>
            <strong>Retention and deletion.</strong> Each finalized file is retained for {policy.document_retention_days} days, then a protected daily process removes it and verifies absence. You may request deletion here at any time; an early request is scheduled for that date. A documented legal hold placed before cleanup is claimed delays deletion. Verification decisions and path-free audit events remain after file deletion.
          </p>
          <p>
            <strong>Your choice and rights.</strong> Uploading is optional until a rental flow requires verification. You may access your evidence, request deletion, or raise a correction or privacy concern by emailing <a className="font-semibold underline underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Never attach or send your government ID by email; use only this protected account upload. CamNook must test the monitored privacy contact before Production activation.
          </p>
          <p className="text-xs text-amber-800">
            Notice {policy.privacy_notice_version} · policy {policy.policy_version}
          </p>
          <Link className="inline-flex font-semibold underline underline-offset-4" href="/privacy/government-id">
            Read the full government ID privacy notice
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-stone-50 p-4">
          <h3 className="font-semibold">Accepted IDs</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-600">
            {acceptedIdTypes.map((idType) => (
              <li key={idType}>{ID_TYPE_LABELS[idType]}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4">
          <h3 className="font-semibold">Accepted files</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            JPEG, PNG, or PDF · one file · up to {formatBytes(policy.max_byte_size)}. File contents must match the selected format.
          </p>
        </div>
      </div>

      {record ? (
        <div className="mt-6 rounded-2xl border border-stone-200 p-5" role="status">
          <h3 className="font-semibold">Current submission</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">ID type</dt>
              <dd className="mt-1 font-medium">
                {ID_TYPE_LABELS[record.id_type as AcceptedIdType] ?? "Government ID"}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Submitted</dt>
              <dd className="mt-1 font-medium">{formatManilaDateTime(record.submitted_at)}</dd>
            </div>
            {document ? (
              <>
                <div>
                  <dt className="text-stone-500">File</dt>
                  <dd className="mt-1 font-medium">
                    {document.media_type} · {formatBytes(document.byte_size)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Retention date</dt>
                  <dd className="mt-1 font-medium">
                    {document.retention_until
                      ? formatManilaDateTime(document.retention_until)
                      : "Unavailable"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-stone-500">
            Private object paths, digests, and ID numbers are never shown on this page.
          </p>
        </div>
      ) : null}

      {state.intent ? (
        <p className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="status">
          An earlier upload is unfinished. Your next attempt will reconcile it or remove its private object before starting safely.
        </p>
      ) : null}

      {!policy.enabled ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          The privacy gate is disabled, so no upload intent can be created.
        </p>
      ) : record?.status === "verified" ? (
        <p className="mt-6 text-sm leading-6 text-stone-600">
          This evidence has a verified decision. Replacement requires a new review workflow and is unavailable in Sprint 1.
        </p>
      ) : canUpload ? (
        <form action={uploadAction} className="mt-7 space-y-5">
          <h3 className="text-lg font-semibold">
            {document && !document.verified_deleted_at ? "Replace current evidence" : "Upload evidence"}
          </h3>
          <input name="policyVersion" type="hidden" value={policy.policy_version} />
          <input name="privacyNoticeVersion" type="hidden" value={policy.privacy_notice_version} />
          <div>
            <label className="block text-sm font-medium" htmlFor="verification-id-type">
              Government ID type
            </label>
            <select
              aria-describedby={uploadState.fieldErrors?.idType ? "verification-id-type-error" : undefined}
              aria-invalid={Boolean(uploadState.fieldErrors?.idType)}
              className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100 sm:max-w-md"
              defaultValue=""
              id="verification-id-type"
              name="idType"
              required
            >
              <option disabled value="">Choose an ID type</option>
              {acceptedIdTypes.map((idType) => (
                <option key={idType} value={idType}>{ID_TYPE_LABELS[idType]}</option>
              ))}
            </select>
            {uploadState.fieldErrors?.idType ? (
              <p className="mt-2 text-sm text-red-700" id="verification-id-type-error" role="alert">
                {uploadState.fieldErrors.idType}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="verification-document">
              ID image or PDF
            </label>
            <input
              accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
              aria-describedby={clientFileError || uploadState.fieldErrors?.document ? "verification-document-error" : "verification-document-help"}
              aria-invalid={Boolean(clientFileError || uploadState.fieldErrors?.document)}
              className="mt-2 block w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-stone-950 file:px-4 file:py-2 file:font-medium file:text-white"
              id="verification-document"
              name="document"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                const message = !file
                  ? undefined
                  : !policy.allowed_media_types.includes(file.type as never)
                    ? "Choose a JPEG, PNG, or PDF."
                    : file.size > policy.max_byte_size
                      ? "Choose a file no larger than 5 MiB."
                      : file.size === 0
                        ? "Choose a non-empty file."
                        : undefined;
                setClientFileError(message);
                if (message) event.currentTarget.value = "";
              }}
              required
              type="file"
            />
            <p className="mt-2 text-xs text-stone-500" id="verification-document-help">
              The server verifies the file type, byte limit, stored size, and SHA-256 digest before creating a pending record.
            </p>
            {clientFileError || uploadState.fieldErrors?.document ? (
              <p className="mt-2 text-sm text-red-700" id="verification-document-error" role="alert">
                {clientFileError ?? uploadState.fieldErrors?.document}
              </p>
            ) : null}
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-4 text-sm leading-6">
            <input
              className="mt-1 size-4"
              name="privacyAcknowledgement"
              required
              type="checkbox"
              value="accepted"
            />
            <span>
              I read notice {policy.privacy_notice_version} and understand the purpose, private access boundary, {policy.document_retention_days}-day retention, deletion process, and legal-hold exception.
            </span>
          </label>
          {uploadState.error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {uploadErrorMessage(uploadState.error)}
            </p>
          ) : null}
          {uploadState.status === "success" ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
              Your private evidence was verified in Storage and the pending submission is recorded. Refreshing or retrying will not create a duplicate current record.
            </p>
          ) : null}
          <button
            className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploadPending || Boolean(clientFileError)}
            type="submit"
          >
            {uploadPending ? "Verifying private upload…" : document ? "Replace evidence" : "Upload evidence"}
          </button>
        </form>
      ) : null}

      {state.documents.length > 0 ? (
        <div className="mt-8 border-t border-stone-200 pt-6">
          <h3 className="font-semibold">Stored evidence lifecycle</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Every current or superseded object keeps its own retention and verified-deletion state. Private paths and digests are omitted.
          </p>
          <ul className="mt-4 space-y-4">
            {state.documents.map((storedDocument) => {
              const isCurrent = storedDocument.id === document?.id && !storedDocument.superseded_at;
              return (
                <li className="rounded-2xl border border-stone-200 p-4" key={storedDocument.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {isCurrent ? "Current evidence" : "Earlier evidence"} · {storedDocument.media_type} · {formatBytes(storedDocument.byte_size)}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {storedDocument.verified_deleted_at
                          ? `Verified deleted ${formatManilaDateTime(storedDocument.verified_deleted_at)}`
                          : storedDocument.legal_hold
                            ? "Deletion blocked by documented legal hold"
                            : storedDocument.deletion_eligible
                              ? "Retention period ended; eligible for deletion"
                              : `Retained until ${storedDocument.retention_until ? formatManilaDateTime(storedDocument.retention_until) : "the approved retention date"}`}
                      </p>
                    </div>
                    {storedDocument.superseded_at ? (
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stone-600">Superseded</span>
                    ) : null}
                  </div>
                  {!storedDocument.verified_deleted_at && !storedDocument.legal_hold ? (
                    <form action={deletionAction} className="mt-3">
                      <input name="documentId" type="hidden" value={storedDocument.id} />
                      <button
                        className="min-h-11 rounded-xl border border-red-300 bg-white px-4 py-2 font-medium text-red-800 disabled:opacity-60"
                        disabled={deletionPending}
                        type="submit"
                      >
                        {deletionPending
                          ? "Checking deletion…"
                          : storedDocument.deletion_eligible
                            ? "Delete this evidence now"
                            : storedDocument.deletion_requested_at
                              ? "Recheck scheduled deletion"
                              : "Request deletion"}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {deletionState.error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {deletionState.error === "legal_hold"
                ? "Deletion is unavailable while a legal hold is active."
                : "Deletion could not be safely verified. Retry from this page; CamNook will not mark the file deleted while an object may remain."}
            </p>
          ) : null}
          {deletionState.status === "success" ? (
            <p className="mt-3 text-sm text-emerald-800" role="status">
              {deletionState.result === "deleted"
                ? "The private object is absent and deletion is recorded."
                : `Deletion is scheduled after the retention period${deletionState.retentionUntil ? ` (${formatManilaDateTime(deletionState.retentionUntil)})` : ""}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
