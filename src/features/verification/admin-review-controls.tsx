"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  decideVerification,
  requestVerificationEvidenceAccess,
  type VerificationAccessActionState,
  type VerificationDecisionActionState,
} from "./admin-actions";
import {
  ID_TYPE_LABELS,
  VERIFICATION_REJECTION_LABELS,
  type AcceptedIdType,
} from "./types";

const initialAccessState: VerificationAccessActionState = { status: "idle" };
const initialDecisionState: VerificationDecisionActionState = {
  status: "idle",
};

function accessErrorMessage(error: VerificationAccessActionState["error"]) {
  switch (error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "This submission is no longer current. Return to the queue.";
    case "unavailable":
      return "The retained evidence is unavailable. Do not make a decision.";
    case "invalid":
      return "The review request is invalid.";
    default:
      return "Access could not be confirmed. Retry before making a decision.";
  }
}

function decisionErrorMessage(
  error: VerificationDecisionActionState["error"],
) {
  switch (error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "This submission was already decided or superseded. Refresh the queue.";
    case "unavailable":
      return "The current submission could not be found.";
    case "invalid":
      return "A database precondition failed. Refresh and review the current evidence again.";
    default:
      return "The outcome could not be confirmed. Refresh the persisted state before retrying.";
  }
}

export function VerificationReviewControls({
  allowedIdTypes,
  minimumExpirationDate,
  recordId,
}: {
  allowedIdTypes: readonly AcceptedIdType[];
  minimumExpirationDate: string;
  recordId: string;
}) {
  const [accessState, accessAction, accessPending] = useActionState(
    requestVerificationEvidenceAccess,
    initialAccessState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    decideVerification,
    initialDecisionState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    decideVerification,
    initialDecisionState,
  );
  const [expiredGrantExpiresAt, setExpiredGrantExpiresAt] = useState<string>();
  const [lastDecision, setLastDecision] = useState<"reject" | "verify">(
    "verify",
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const decisionState = lastDecision === "reject" ? rejectState : verifyState;
  const decisionPending = verifyPending || rejectPending;
  const committed =
    verifyState.status === "success" || rejectState.status === "success";

  useEffect(() => {
    if (accessState.status !== "success" || !accessState.expiresAt) return;
    const remaining = Math.max(0, Date.parse(accessState.expiresAt) - Date.now());
    const expiresAt = accessState.expiresAt;
    const timeout = window.setTimeout(
      () => setExpiredGrantExpiresAt(expiresAt),
      remaining,
    );
    return () => window.clearTimeout(timeout);
  }, [accessState]);

  useEffect(() => {
    if (decisionState.status !== "idle") resultRef.current?.focus();
  }, [decisionState]);

  const accessExpired =
    accessState.status === "success" &&
    accessState.expiresAt === expiredGrantExpiresAt;
  const activeSignedUrl =
    accessState.status === "success" && !accessExpired
      ? accessState.signedUrl
      : undefined;
  const reviewedDocumentId =
    accessState.status === "success" ? accessState.documentId : undefined;

  return (
    <section className="mt-8 border-t border-stone-200 pt-7">
      <h2 className="text-xl font-semibold">Purpose-bound evidence access</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Request access only to compare the permitted visible fields for this
        identity-review decision. Access is audited before one 60-second signed
        link is issued. Do not copy, download, screenshot, or share the image.
      </p>
      <form action={accessAction} className="mt-4">
        <input name="recordId" type="hidden" value={recordId} />
        <button
          className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={accessPending || committed}
          type="submit"
        >
          {accessPending ? "Authorizing access…" : "Open evidence for 60 seconds"}
        </button>
      </form>
      {activeSignedUrl ? (
        <div
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
        >
          <p>
            The audited link expires in 60 seconds. Close the evidence tab as
            soon as the comparison is complete.
          </p>
          <a
            className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            href={activeSignedUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            View private evidence in a new tab
          </a>
        </div>
      ) : accessState.status === "success" && accessExpired ? (
        <p className="mt-4 text-sm text-stone-600" role="status">
          The evidence link has expired. Request a new audited access if needed.
        </p>
      ) : accessState.status === "error" ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {accessErrorMessage(accessState.error)}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 border-t border-stone-200 pt-7 lg:grid-cols-2">
        <form
          action={verifyAction}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
          onSubmit={() => setLastDecision("verify")}
        >
          <input name="recordId" type="hidden" value={recordId} />
          <input
            name="reviewedDocumentId"
            type="hidden"
            value={reviewedDocumentId ?? ""}
          />
          <input name="decision" type="hidden" value="verified" />
          <h3 className="font-semibold text-emerald-950">Verify identity</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            Confirm only after reviewing the current evidence. The database
            requires an approved ID type and a future Manila expiration date.
          </p>
          <label
            className="mt-4 block text-sm font-medium text-emerald-950"
            htmlFor="approved-id-type"
          >
            Approved ID type
          </label>
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3"
            defaultValue=""
            id="approved-id-type"
            name="approvedIdType"
            required
          >
            <option disabled value="">Choose the reviewed type</option>
            {allowedIdTypes.map((idType) => (
              <option key={idType} value={idType}>
                {ID_TYPE_LABELS[idType]}
              </option>
            ))}
          </select>
          {verifyState.fieldErrors?.approvedIdType ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {verifyState.fieldErrors.approvedIdType}
            </p>
          ) : null}
          <label
            className="mt-4 block text-sm font-medium text-emerald-950"
            htmlFor="document-expiration-date"
          >
            Document expiration date (Asia/Manila)
          </label>
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3"
            id="document-expiration-date"
            min={minimumExpirationDate}
            name="documentExpirationDate"
            required
            type="date"
          />
          {verifyState.fieldErrors?.documentExpirationDate ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {verifyState.fieldErrors.documentExpirationDate}
            </p>
          ) : null}
          <button
            className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={decisionPending || committed || !reviewedDocumentId}
            type="submit"
          >
            {verifyPending ? "Recording verification…" : "Verify identity"}
          </button>
        </form>

        <form
          action={rejectAction}
          className="rounded-2xl border border-red-200 bg-red-50 p-5"
          onSubmit={() => setLastDecision("reject")}
        >
          <input name="recordId" type="hidden" value={recordId} />
          <input
            name="reviewedDocumentId"
            type="hidden"
            value={reviewedDocumentId ?? ""}
          />
          <input name="decision" type="hidden" value="rejected" />
          <h3 className="font-semibold text-red-950">Reject submission</h3>
          <p className="mt-2 text-sm leading-6 text-red-900">
            Choose a predefined renter-safe reason. Free-text identity details
            are never accepted or stored as the decision reason.
          </p>
          <label
            className="mt-4 block text-sm font-medium text-red-950"
            htmlFor="rejection-reason-code"
          >
            Rejection reason
          </label>
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-red-300 bg-white px-4 py-3"
            defaultValue=""
            id="rejection-reason-code"
            name="rejectionReasonCode"
            required
          >
            <option disabled value="">Choose a safe reason</option>
            {Object.entries(VERIFICATION_REJECTION_LABELS).map(
              ([reason, label]) => (
                <option key={reason} value={reason}>
                  {label}
                </option>
              ),
            )}
          </select>
          {rejectState.fieldErrors?.rejectionReasonCode ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {rejectState.fieldErrors.rejectionReasonCode}
            </p>
          ) : null}
          <button
            className="mt-5 min-h-12 w-full rounded-xl bg-red-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={decisionPending || committed || !reviewedDocumentId}
            type="submit"
          >
            {rejectPending ? "Recording rejection…" : "Reject submission"}
          </button>
        </form>
      </div>

      {!reviewedDocumentId ? (
        <p className="mt-4 text-sm font-medium text-stone-700">
          Request and review the current evidence before recording either
          decision. The database binds the decision to that exact document.
        </p>
      ) : null}

      {decisionState.status !== "idle" ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            decisionState.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
          ref={resultRef}
          role={decisionState.status === "success" ? "status" : "alert"}
          tabIndex={-1}
        >
          {decisionState.status === "success"
            ? decisionState.action === "verify"
              ? "Identity is verified. Booking approval can now recheck this current decision."
              : "The submission is rejected. The renter can see a safe reason and upload a replacement."
            : decisionErrorMessage(decisionState.error)}
        </div>
      ) : null}
    </section>
  );
}
