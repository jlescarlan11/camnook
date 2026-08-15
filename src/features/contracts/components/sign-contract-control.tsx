"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  signContract,
  type SignContractActionState,
} from "../actions";

const initialState: SignContractActionState = { status: "idle" };

export function SignContractControl({
  bookingId,
  canSign,
  contractVersionId,
}: {
  bookingId: string;
  canSign: boolean;
  contractVersionId: string;
}) {
  const [state, action, pending] = useActionState(signContract, initialState);
  const resultRef = useRef<HTMLDivElement>(null);
  const message = actionMessage(state, pending);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  return (
    <section
      aria-busy={pending}
      aria-labelledby="sign-contract-heading"
      className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold" id="sign-contract-heading">
        Sign this exact agreement
      </h2>
      <p className="mt-2 text-sm leading-6 text-amber-950">
        Your server-authenticated account, this version, the fixed consent, and
        the trusted signing time are recorded together. A retry cannot create a
        duplicate signature.
      </p>
      <form action={action} className="mt-5">
        <input name="bookingId" type="hidden" value={bookingId} />
        <input
          name="contractVersionId"
          type="hidden"
          value={contractVersionId}
        />
        <label className="flex items-start gap-3 text-sm leading-6 text-amber-950">
          <input
            aria-describedby={
              state.fieldErrors?.consent ? "consent-help consent-error" : "consent-help"
            }
            aria-invalid={Boolean(state.fieldErrors?.consent)}
            className="mt-1 size-5 shrink-0 accent-amber-800"
            disabled={!canSign || pending || state.status === "success"}
            name="consent"
            required
            type="checkbox"
          />
          <span id="consent-help">
            I have reviewed and agree to this exact rental agreement, and I
            intend this electronic action to be my signature.
          </span>
        </label>
        {state.fieldErrors?.consent ? (
          <p className="mt-2 text-sm font-medium text-red-800" id="consent-error">
            {state.fieldErrors.consent}
          </p>
        ) : null}
        <button
          className="mt-5 min-h-12 w-full rounded-xl bg-amber-900 px-5 py-3 font-semibold text-white transition hover:bg-amber-800 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!canSign || pending || state.status === "success"}
          type="submit"
        >
          {pending ? "Signing…" : state.status === "success" ? "Signed" : "Sign agreement"}
        </button>
        {!canSign && state.status !== "success" ? (
          <p className="mt-3 text-sm font-medium text-amber-950">
            This agreement is not currently signable.
          </p>
        ) : null}
      </form>
      {message ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : state.status === "indeterminate"
                ? "border-amber-300 bg-white text-amber-950"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
          ref={resultRef}
          role={state.status === "success" ? "status" : "alert"}
          tabIndex={-1}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}

function actionMessage(state: SignContractActionState, pending: boolean) {
  if (pending) return "Recording your signature…";
  if (state.status === "success") {
    return state.created
      ? "Signature recorded. This booking is now ready for payment."
      : "This exact signature was already recorded. No duplicate was created.";
  }
  if (state.error === "expired") {
    return "The original approval deadline has passed. Refresh to see the expired booking.";
  }
  if (state.error === "stale") {
    return "This agreement changed or is no longer current. Refresh before taking another action.";
  }
  if (state.error === "unauthorized") {
    return "You are not authorized to sign this agreement.";
  }
  if (state.error === "invalid_input") {
    return "Review the required consent and refresh if this contract version changed.";
  }
  if (state.status === "indeterminate") {
    return "The result could not be confirmed. Refresh before retrying; a safe retry will not duplicate the signature.";
  }
  return null;
}
