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
    case "consent_required":
      return "Read the privacy notice and give specific consent before uploading.";
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
            Government ID evidence (not active)
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
            <strong>Status and purpose.</strong> Production collection is disabled. The draft flow is intended to let an authorized reviewer compare a masked ID image with the named renter for account-level fraud prevention. The current upload pipeline checks file integrity only; it does not verify identity or make a decision.
          </p>
          <p>
            <strong>Minimize first.</strong> Use one JPEG or PNG showing one side or page only. Cover the ID or document number (including PSN/PCN/CRN), address, full birth date, signature, QR/barcode, and machine-readable zone. Leave only the name, portrait, ID type, and expiry needed for the proposed comparison. Do not upload an unmasked or real ID in a test environment.
          </p>
          <p>
            <strong>Access and retention.</strong> The image stays in private Storage. The owning renter can retrieve it; the current system grants staff no raw-byte access. A future reviewer flow requires separate approval, short-lived access, and read auditing. The image must be deleted as soon as it is no longer needed and no later than {policy.document_retention_days} days after finalization. You may withdraw consent and delete it immediately unless a documented legal exception applies. Superseded evidence becomes due for the protected cleanup worker.
          </p>
          <p>
            <strong>Your rights.</strong> Collection will not be enabled until CamNook publishes the legal personal-information-controller identity, address, DPO details, processing basis, recipients and locations, complete retention schedule, consequences and any alternative to providing an ID, and a working rights process. Email <a className="font-semibold underline underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> for access, correction, deletion, objection, withdrawal, or complaint handling. Never send an ID file by email.
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
            JPEG or PNG · one masked side/page · up to {formatBytes(policy.max_byte_size)}. File contents must match the selected format.
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
                  <dt className="text-stone-500">Delete no later than</dt>
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
              Masked ID image
            </label>
            <input
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
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
                    ? "Choose a JPEG or PNG."
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
              Upload one masked side/page only. The server checks file type, byte limit, stored size, and SHA-256 integrity; those checks do not establish identity.
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
              name="privacyConsent"
              required
              type="checkbox"
              value="consent-government-id-processing"
            />
            <span>
              I have read notice {policy.privacy_notice_version}. I specifically consent to CamNook processing this masked image for the stated account-level identity-comparison and fraud-prevention purpose. I understand that I may withdraw this consent and request immediate deletion of the image, subject only to a documented legal exception.
            </span>
          </label>
          {uploadState.error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {uploadErrorMessage(uploadState.error)}
            </p>
          ) : null}
          {uploadState.status === "success" ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
              File integrity was verified in private Storage and the pending submission is recorded. This does not mean that identity has been verified. Refreshing or retrying will not create a duplicate current record.
            </p>
          ) : null}
          <button
            className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={uploadPending || Boolean(clientFileError)}
            type="submit"
          >
            {uploadPending ? "Checking private upload…" : document ? "Replace evidence" : "Upload evidence"}
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
                              ? "Due for deletion"
                              : `Delete no later than ${storedDocument.retention_until ? formatManilaDateTime(storedDocument.retention_until) : "the policy deadline"}`}
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
                        {deletionPending ? "Deleting evidence…" : "Delete this evidence now"}
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
              The private object is absent and deletion is recorded.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
