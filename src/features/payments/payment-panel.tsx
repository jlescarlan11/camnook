"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";

import {
  submitPayment,
  uploadPaymentProof,
  type PaymentActionState,
} from "./actions";
import {
  PAYMENT_REJECTION_MESSAGES,
  type PaymentState,
} from "./types";

const initialState: PaymentActionState = { status: "idle" };
async function submitPaymentAction(
  action: typeof submitPayment,
  previous: PaymentActionState,
  data: FormData,
): Promise<PaymentActionState> {
  try {
    return await action(previous, data);
  } catch {
    return { error: "indeterminate", status: "error" };
  }
}

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function actionErrorMessage(error: PaymentActionState["error"]) {
  switch (error) {
    case "unauthorized":
      return "Sign in again before submitting payment information.";
    case "invalid":
      return "Check the payment fields and proof file, then try again.";
    case "proof_failed":
      return "The payment details were accepted, but the proof was not saved. Use the proof form to retry; do not submit the transfer again.";
    case "recipient_unavailable":
      return "Payment instructions or the current signed contract are unavailable. No payment details were accepted.";
    case "stale":
      return "The booking or payment changed before this request committed. Refresh to see the persisted outcome.";
    default:
      return "The persisted outcome could not be confirmed. Refresh before retrying.";
  }
}

function ProofField({ disabled, error, id }: { disabled: boolean; error?: string; id: string }) {
  const describedBy = [`${id}-help`, error ? `${id}-error` : undefined].filter(Boolean).join(" ");
  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={id}>
        Transfer proof
      </label>
      <input
        accept="image/jpeg,image/png"
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        className="mt-2 block min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:font-medium file:text-amber-950"
        id={id}
        name="proof"
        required
        type="file"
      />
      <p className="mt-2 text-xs leading-5 text-stone-500" id={`${id}-help`}>
        Required JPEG or PNG, maximum 5 MiB. Proof is private and never
        replaces checking the actual approved GCash account.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-red-800" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PaymentPanel({
  attemptId,
  payment,
}: {
  attemptId: string;
  payment: PaymentState;
}) {
  const [submitState, submitAction, submitPending] = useActionState(
    (previous: PaymentActionState, data: FormData) => submitPaymentAction(submitPayment, previous, data),
    initialState,
  );
  const [proofState, proofAction, proofPending] = useActionState(
    (previous: PaymentActionState, data: FormData) => submitPaymentAction(uploadPaymentProof, previous, data),
    initialState,
  );
  const [lastAction, setLastAction] = useState<"submit" | "proof">("submit");
  const resultState = lastAction === "proof" ? proofState : submitState;
  const resultRef = useRef<HTMLDivElement>(null);
  const proofFormRef = useRef<HTMLFormElement>(null);
  const submitFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (submitState.status === "success") submitFormRef.current?.reset();
  }, [submitState]);

  useEffect(() => {
    if (proofState.status === "success") proofFormRef.current?.reset();
  }, [proofState]);

  useEffect(() => {
    if (submitState.status !== "idle" || proofState.status !== "idle") {
      resultRef.current?.focus();
    }
  }, [proofState.status, submitState.status]);

  const transaction = payment.transaction;
  const rejectionMessage = transaction?.rejection_reason_code
    ? PAYMENT_REJECTION_MESSAGES[transaction.rejection_reason_code]
    : PAYMENT_REJECTION_MESSAGES.other;

  return (
    <section
      aria-labelledby="payment-heading"
      className="mt-7 border-t border-stone-200 pt-6"
    >
      <h2 className="text-lg font-semibold" id="payment-heading">
        GCash payment
      </h2>

      {transaction?.status === "submitted" ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
          <p className="font-semibold">Payment under review</p>
          <p className="mt-1">
            Submitted {formatManilaDateTime(transaction.submitted_at)} before
            the original deadline. It remains in PAYMENT_REVIEW while an
            administrator checks the actual approved GCash account.
          </p>
          <p className="mt-1">
            {transaction.proof_exists
              ? "A private proof is attached. You may replace it with a corrected version while review is pending."
              : "The proof upload needs to be retried below before reconciliation can be completed."}
          </p>
        </div>
      ) : transaction?.status === "verified" ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950" role="status">
          This payment was reconciled against the approved GCash account. The
          booking is confirmed.
        </p>
      ) : transaction?.status === "rejected" ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950" role="alert">
          <p className="font-semibold">The previous submission was rejected</p>
          <p className="mt-1">{rejectionMessage}</p>
          {payment.booking_state === "TO_PAY" ? (
            <p className="mt-1">
              You may submit corrected details only before the unchanged
              original deadline.
            </p>
          ) : null}
        </div>
      ) : null}

      {payment.approval_deadline_at ? (
        <p className="mt-4 text-sm text-stone-600">
          Original payment deadline: {formatManilaDateTime(payment.approval_deadline_at)}
        </p>
      ) : null}

      {payment.instructions ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h3 className="font-semibold">Payment details</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Instruction label="Recipient" value={payment.instructions.recipient_name} />
            <Instruction label="GCash account" value={payment.instructions.recipient_account} />
            <Instruction label="Rental amount" value={phpFormatter.format(payment.instructions.rental_amount)} />
            <Instruction label="Security deposit" value={phpFormatter.format(payment.instructions.security_deposit)} />
            <Instruction label="Total" value={phpFormatter.format(payment.instructions.total_due)} />
          </dl>
          <p className="mt-4 text-xs leading-5">
            Transfer only to this approved recipient and submit the exact total.
            CamNook will never ask for a GCash PIN or one-time code.
          </p>
        </div>
      ) : payment.instructions_error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          {payment.instructions_error === "recipient_unavailable"
            ? "The approved GCash recipient is unavailable. Payment submission is disabled and no fallback account is shown."
            : "The current signed contract does not match the booking snapshot. Payment submission is disabled."}
        </p>
      ) : null}

      {payment.can_submit && payment.instructions ? (
        <form ref={submitFormRef} onSubmit={(event) => {
          event.preventDefault();
          if (submitPending) return;
          const formData = new FormData(event.currentTarget);
          setLastAction("submit");
          startTransition(() => submitAction(formData));
        }} className="mt-5 space-y-4">
          <input name="attemptId" type="hidden" value={attemptId} />
          <input name="bookingId" type="hidden" value={payment.booking_id} />
          <div>
            <label className="block text-sm font-medium" htmlFor="payment-reference">
              GCash reference
            </label>
            <input
              autoComplete="off"
              aria-describedby={submitState.fieldErrors?.reference ? "payment-reference-error" : undefined}
              aria-invalid={submitState.fieldErrors?.reference ? true : undefined}
              disabled={submitPending}
              className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
              id="payment-reference"
              maxLength={120}
              name="reference"
              pattern="[A-Za-z0-9 -]{4,120}"
              required
            />
            {submitState.fieldErrors?.reference ? (
              <p className="mt-2 text-sm text-red-800" id="payment-reference-error" role="alert">{submitState.fieldErrors.reference}</p>
            ) : null}
          </div>
          <ProofField disabled={submitPending} error={submitState.fieldErrors?.proof} id="payment-proof" />
          <button
            className="min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitPending}
            type="submit"
          >
            {submitPending ? "Submitting payment details…" : "Submit payment for review"}
          </button>
        </form>
      ) : null}

      {transaction?.status === "submitted" ? (
        <form ref={proofFormRef} onSubmit={(event) => {
          event.preventDefault();
          if (proofPending) return;
          const formData = new FormData(event.currentTarget);
          setLastAction("proof");
          startTransition(() => proofAction(formData));
        }} className="mt-5 space-y-4 rounded-xl border border-stone-200 p-5">
          <input name="bookingId" type="hidden" value={payment.booking_id} />
          <input name="transactionId" type="hidden" value={transaction.id} />
          <h3 className="font-semibold">
            {transaction.proof_exists ? "Replace payment proof" : "Add payment proof"}
          </h3>
          <ProofField disabled={proofPending} error={proofState.fieldErrors?.proof} id="pending-payment-proof" />
          <button
            className="min-h-12 rounded-xl border border-stone-300 bg-white px-5 py-3 font-semibold disabled:opacity-60"
            disabled={proofPending}
            type="submit"
          >
            {proofPending ? "Saving private proof…" : transaction.proof_exists ? "Save corrected proof" : "Save proof"}
          </button>
        </form>
      ) : null}

      {resultState.status !== "idle" ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            resultState.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
          ref={resultRef}
          role={resultState.status === "success" ? "status" : "alert"}
          tabIndex={-1}
        >
          {resultState.status === "success"
            ? lastAction === "proof"
              ? "The private proof was saved. The payment remains in review."
              : "Payment details were accepted for reconciliation. The original deadline remains unchanged."
            : actionErrorMessage(resultState.error)}
        </div>
      ) : null}
    </section>
  );
}

function Instruction({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3">
      <dt className="text-xs text-amber-800">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>
  );
}
