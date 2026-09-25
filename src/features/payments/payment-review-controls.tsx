"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import {
  decidePayment,
  requestPaymentProofAccess,
  type PaymentAccessActionState,
  type PaymentDecisionActionState,
} from "./admin-actions";
import { PAYMENT_REJECTION_LABELS } from "./types";

const initialAccessState: PaymentAccessActionState = { status: "idle" };
const initialDecisionState: PaymentDecisionActionState = { status: "idle" };

async function submitPaymentDecision(previous: PaymentDecisionActionState, data: FormData): Promise<PaymentDecisionActionState> {
  try {
    return await decidePayment(previous, data);
  } catch {
    return { action: data.get("decision") === "rejected" ? "reject" : "verify", error: "indeterminate", status: "error" };
  }
}

function accessErrorMessage(error: PaymentAccessActionState["error"]) {
  switch (error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "This payment or its proof changed. Refresh before opening evidence.";
    case "unavailable":
      return "No current finalized proof is available.";
    case "invalid":
      return "The proof access request is invalid.";
    default:
      return "Proof access could not be confirmed. Retry before opening evidence.";
  }
}

function decisionErrorMessage(state: PaymentDecisionActionState) {
  if (state.fieldErrors?.paymentId) return state.fieldErrors.paymentId;

  switch (state.error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "Another operation already changed this payment or booking. Refresh the persisted outcome.";
    case "unavailable":
      return "The current submitted payment could not be found.";
    case "duplicate":
      return "That normalized reference already belongs to a verified transfer. Reject with the safe duplicate-reference reason after confirming the actual account.";
    case "invalid":
      return "The observed transfer did not match the authoritative amount or submitted reference.";
    default:
      return "The committed outcome could not be confirmed. Refresh before retrying.";
  }
}

type PaymentReviewProps = {
  hasProof: boolean;
  paymentId: string;
  proofId?: string;
};

export function PaymentReviewControls(props: PaymentReviewProps) {
  // Revalidated evidence must not inherit an older signed URL or attestation.
  return <PaymentReviewForm key={`${props.paymentId}:${props.proofId ?? "none"}`} {...props} />;
}

function PaymentReviewForm({
  hasProof,
  paymentId,
  proofId,
}: PaymentReviewProps) {
  const [accessState, accessAction, accessPending] = useActionState(
    async (previous: PaymentAccessActionState, data: FormData): Promise<PaymentAccessActionState> => {
      try {
        return await requestPaymentProofAccess(previous, data);
      } catch {
        return { error: "indeterminate", status: "error" };
      }
    },
    initialAccessState,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    submitPaymentDecision,
    initialDecisionState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    submitPaymentDecision,
    initialDecisionState,
  );
  const [lastDecision, setLastDecision] = useState<"reject" | "verify">("verify");
  const [expiredAt, setExpiredAt] = useState<string>();
  const resultRef = useRef<HTMLDivElement>(null);
  const decisionState = lastDecision === "reject" ? rejectState : verifyState;
  const pending = verifyPending || rejectPending;
  const committed =
    verifyState.status === "success" || rejectState.status === "success";

  useEffect(() => {
    if (accessState.status !== "success" || !accessState.expiresAt) return;
    const expiresAt = accessState.expiresAt;
    const timeout = window.setTimeout(
      () => setExpiredAt(expiresAt),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [accessState.expiresAt, accessState.status]);

  useEffect(() => {
    if (decisionState.status !== "idle") resultRef.current?.focus();
  }, [decisionState.status]);

  const accessExpired =
    accessState.status === "success" && accessState.expiresAt === expiredAt;
  const signedUrl =
    accessState.status === "success" && !accessExpired
      ? accessState.signedUrl
      : undefined;

  return (
    <section className="mt-8 border-t border-stone-200 pt-7">
      <h2 className="text-xl font-semibold">Audited proof access</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Proof is supporting evidence only. A screenshot is never sufficient to
        verify payment; check the approved GCash account and enter the observed
        amount and reference below.
      </p>
      {hasProof ? (
        <form action={accessAction} className="mt-4">
          <input name="paymentId" type="hidden" value={paymentId} />
          <input name="expectedProofId" type="hidden" value={proofId ?? ""} />
          <button
            className="min-h-12 rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold disabled:opacity-60"
            disabled={accessPending || committed}
            type="submit"
          >
            {accessPending ? "Authorizing access…" : "Open proof for 60 seconds"}
          </button>
        </form>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No finalized proof is attached. Verification remains unavailable until the renter uploads one; rejection is still available.
        </p>
      )}
      {signedUrl ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <p>This purpose-bound link expires in 60 seconds.</p>
          <a
            className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
            href={signedUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            View private proof in a new tab
          </a>
        </div>
      ) : accessExpired ? (
        <p className="mt-4 text-sm text-stone-600" role="status">
          The proof link expired. Request a new audited link if needed.
        </p>
      ) : accessState.status === "error" ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          {accessErrorMessage(accessState.error)}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 border-t border-stone-200 pt-7 lg:grid-cols-2">
        <form
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || committed) return;
            setLastDecision("verify");
            const formData = new FormData(event.currentTarget);
            // Returned errors must not reset the observed transfer details.
            startTransition(() => verifyAction(formData));
          }}
        >
          <input name="decision" type="hidden" value="verified" />
          <input name="paymentId" type="hidden" value={paymentId} />
          <input name="expectedProofId" type="hidden" value={proofId ?? ""} />
          <h3 className="font-semibold text-emerald-950">Verify transfer</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            The database requires the exact authoritative total, the same
            normalized submitted reference, and a unique verified reference.
          </p>
          <label className="mt-4 block text-sm font-medium text-emerald-950" htmlFor="observed-payment-amount">
            Amount observed in approved GCash account
          </label>
          <input
            aria-describedby={
              verifyState.fieldErrors?.observedAmount
                ? "payment-observed-amount-error"
                : undefined
            }
            aria-invalid={verifyState.fieldErrors?.observedAmount ? true : undefined}
            className="mt-2 min-h-12 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3"
            id="observed-payment-amount"
            inputMode="decimal"
            name="observedAmount"
            pattern="\d+(\.\d{1,2})?"
            required
          />
          {verifyState.fieldErrors?.observedAmount ? (
            <p
              className="mt-2 text-sm text-red-800"
              id="payment-observed-amount-error"
              role="alert"
            >
              {verifyState.fieldErrors.observedAmount}
            </p>
          ) : null}
          <label className="mt-4 block text-sm font-medium text-emerald-950" htmlFor="observed-payment-reference">
            Reference observed in approved GCash account
          </label>
          <input
            aria-describedby={
              verifyState.fieldErrors?.observedReference
                ? "payment-observed-reference-error"
                : undefined
            }
            aria-invalid={verifyState.fieldErrors?.observedReference ? true : undefined}
            autoComplete="off"
            className="mt-2 min-h-12 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3"
            id="observed-payment-reference"
            maxLength={120}
            name="observedReference"
            pattern="[A-Za-z0-9 -]{4,120}"
            required
          />
          {verifyState.fieldErrors?.observedReference ? (
            <p
              className="mt-2 text-sm text-red-800"
              id="payment-observed-reference-error"
              role="alert"
            >
              {verifyState.fieldErrors.observedReference}
            </p>
          ) : null}
          <label className="mt-4 flex gap-3 text-sm leading-6 text-emerald-950">
            <input
              aria-describedby={
                verifyState.fieldErrors?.actualAccount
                  ? "payment-actual-account-error"
                  : undefined
              }
              aria-invalid={verifyState.fieldErrors?.actualAccount ? true : undefined}
              className="mt-1 size-5 shrink-0"
              name="actualAccount"
              required
              type="checkbox"
              value="confirmed-actual-account"
            />
            <span>I checked the actual transfer in the approved GCash account; I am not relying on the screenshot alone.</span>
          </label>
          {verifyState.fieldErrors?.actualAccount ? (
            <p
              className="mt-2 text-sm text-red-800"
              id="payment-actual-account-error"
              role="alert"
            >
              {verifyState.fieldErrors.actualAccount}
            </p>
          ) : null}
          <button
            className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={pending || committed || !hasProof}
            type="submit"
          >
            {verifyPending ? "Reconciling transfer…" : "Verify and confirm booking"}
          </button>
        </form>

        <form
          className="rounded-xl border border-red-200 bg-red-50 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || committed) return;
            setLastDecision("reject");
            const formData = new FormData(event.currentTarget);
            startTransition(() => rejectAction(formData));
          }}
        >
          <input name="decision" type="hidden" value="rejected" />
          <input name="paymentId" type="hidden" value={paymentId} />
          <h3 className="font-semibold text-red-950">Reject submission</h3>
          <p className="mt-2 text-sm leading-6 text-red-900">
            Choose a predefined renter-safe reason. The database uses its own
            clock and the unchanged original deadline to decide TO_PAY or EXPIRED.
          </p>
          <label className="mt-4 block text-sm font-medium text-red-950" htmlFor="payment-rejection-reason">
            Rejection reason
          </label>
          <select
            aria-describedby={
              rejectState.fieldErrors?.rejectionReasonCode
                ? "payment-rejection-reason-error"
                : undefined
            }
            aria-invalid={
              rejectState.fieldErrors?.rejectionReasonCode ? true : undefined
            }
            className="mt-2 min-h-12 w-full rounded-xl border border-red-300 bg-white px-4 py-3"
            defaultValue=""
            id="payment-rejection-reason"
            name="rejectionReasonCode"
            required
          >
            <option disabled value="">Choose a safe reason</option>
            {Object.entries(PAYMENT_REJECTION_LABELS).map(([reason, label]) => (
              <option key={reason} value={reason}>{label}</option>
            ))}
          </select>
          {rejectState.fieldErrors?.rejectionReasonCode ? (
            <p
              className="mt-2 text-sm text-red-800"
              id="payment-rejection-reason-error"
              role="alert"
            >
              {rejectState.fieldErrors.rejectionReasonCode}
            </p>
          ) : null}
          <button
            className="mt-5 min-h-12 w-full rounded-xl bg-red-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={pending || committed}
            type="submit"
          >
            {rejectPending ? "Recording rejection…" : "Reject payment submission"}
          </button>
        </form>
      </div>

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
              ? "The transfer was reconciled and the booking is confirmed."
              : decisionState.bookingState === "TO_PAY"
                ? "The submission was rejected. The renter may retry before the unchanged original deadline."
                : "The submission was rejected after the deadline. The booking expired and its availability block was released."
            : decisionErrorMessage(decisionState)}
        </div>
      ) : null}
    </section>
  );
}
