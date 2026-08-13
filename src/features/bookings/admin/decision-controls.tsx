"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  approveBooking,
  rejectBooking,
  type DecisionActionState,
} from "./actions";
import {
  decisionControlPresentation,
  nextRejectionReason,
  sharedDecisionPending,
} from "./presenter";

const initialDecisionState: DecisionActionState = { status: "idle" };

export function DecisionControls({
  bookingId,
  ready,
}: {
  bookingId: string;
  ready: boolean;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveBooking,
    initialDecisionState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectBooking,
    initialDecisionState,
  );
  const [lastAction, setLastAction] = useState<"approve" | "reject">(
    "approve",
  );
  const [reason, setReason] = useState("");
  const pending = sharedDecisionPending(approvePending, rejectPending);
  const state = lastAction === "approve" ? approveState : rejectState;
  const displayedReason = nextRejectionReason(reason, rejectState);
  const presentation = decisionControlPresentation(state, pending, ready);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (presentation.shouldFocusResult) resultRef.current?.focus();
  }, [presentation.shouldFocusResult, state]);

  return (
    <section
      aria-busy={presentation.ariaBusy}
      aria-labelledby="decision-heading"
      className="mt-8 border-t border-stone-200 pt-7"
    >
      <h2 className="text-xl font-semibold" id="decision-heading">
        Record a decision
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Approval recalculates all authoritative values in one database
        transaction. The values shown on this page are never sent as authority.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <form
          action={approveAction}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
          onSubmit={() => setLastAction("approve")}
        >
          <input name="bookingId" type="hidden" value={bookingId} />
          <h3 className="font-semibold text-emerald-950">Approve request</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            Creates the persisted contract-pending aggregate only when every
            database precondition still passes.
          </p>
          <button
            className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={presentation.disableApprove}
            type="submit"
          >
            {pending && lastAction === "approve"
              ? "Approving…"
              : "Approve booking"}
          </button>
          {!ready ? (
            <p className="mt-3 text-sm font-medium text-emerald-950">
              Approval is blocked until every readiness condition passes.
            </p>
          ) : null}
        </form>

        <form
          action={rejectAction}
          className="rounded-2xl border border-red-200 bg-red-50 p-5"
          onSubmit={() => setLastAction("reject")}
        >
          <input name="bookingId" type="hidden" value={bookingId} />
          <label className="font-semibold text-red-950" htmlFor="reason">
            Rejection reason
          </label>
          <p className="mt-2 text-sm leading-6 text-red-900" id="reason-help">
            This reason is saved to booking history and remains visible on the
            persisted result.
          </p>
          <textarea
            aria-describedby={
              rejectState.fieldErrors?.reason
                ? "reason-help reason-error"
                : "reason-help"
            }
            aria-invalid={Boolean(rejectState.fieldErrors?.reason)}
            className="mt-4 min-h-28 w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-base text-stone-950 outline-none focus:border-red-700 focus:ring-4 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            id="reason"
            maxLength={1000}
            minLength={2}
            name="reason"
            onChange={(event) => setReason(event.target.value)}
            required
            value={displayedReason}
          />
          {rejectState.fieldErrors?.reason ? (
            <p className="mt-2 text-sm font-medium text-red-800" id="reason-error">
              {rejectState.fieldErrors.reason}
            </p>
          ) : null}
          <button
            className="mt-4 min-h-12 w-full rounded-xl bg-red-800 px-5 py-3 font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={presentation.disableReject}
            type="submit"
          >
            {pending && lastAction === "reject"
              ? "Rejecting…"
              : "Reject booking"}
          </button>
        </form>
      </div>

      {presentation.liveMessage ? (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
            presentation.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : presentation.tone === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
          ref={resultRef}
          role={presentation.role}
          tabIndex={-1}
        >
          {presentation.liveMessage}
        </div>
      ) : null}
    </section>
  );
}
