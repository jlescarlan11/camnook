"use client";

import { useActionState } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";
import {
  requestMyConditionPhotoAccess,
  type ConditionPhotoActionState,
} from "@/features/pickup/actions";

import {
  requestCancellation,
  type ResolutionActionState,
} from "./actions";
import type { MyResolutionState } from "./types";

const initialState: ResolutionActionState = { status: "idle" };
const initialPhotoState: ConditionPhotoActionState = { status: "idle" };
const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export function RenterResolutionStatus({
  operationId,
  resolution,
}: {
  operationId: string;
  resolution: MyResolutionState;
}) {
  const [cancellationState, cancellationAction, cancellationPending] =
    useActionState(requestCancellation, initialState);
  const [accessState, accessAction, accessPending] = useActionState(
    requestMyConditionPhotoAccess,
    initialPhotoState,
  );

  return (
    <section
      aria-labelledby="resolution-status-heading"
      className="mt-7 border-t border-stone-200 pt-6"
    >
      <h2 className="text-lg font-semibold" id="resolution-status-heading">
        Return, cancellation, and deposit outcome
      </h2>

      {resolution.can_request_cancellation ? (
        <form action={cancellationAction} className="mt-4 space-y-3 rounded-xl border border-stone-200 p-4">
          <input name="bookingId" type="hidden" value={resolution.booking_id} />
          <input name="operationId" type="hidden" value={operationId} />
          <p className="text-sm leading-6 text-stone-600">
            A request does not cancel or rewrite your booking. An administrator
            must recheck the current state and record an explicit outcome.
          </p>
          <label className="block text-sm font-medium" htmlFor="cancellation-request-reason">
            Why are you requesting cancellation?
          </label>
          <textarea
            className="min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3"
            id="cancellation-request-reason"
            maxLength={1000}
            minLength={2}
            name="reason"
            required
          />
          <button
            className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold disabled:opacity-60"
            disabled={cancellationPending}
            type="submit"
          >
            {cancellationPending ? "Submitting request…" : "Request cancellation review"}
          </button>
        </form>
      ) : null}

      {cancellationState.status !== "idle" ? (
        <p
          className={`mt-3 rounded-xl border p-3 text-sm ${cancellationState.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
          role={cancellationState.status === "success" ? "status" : "alert"}
        >
          {cancellationState.status === "success"
            ? "Your request was saved. The booking state is unchanged while it awaits review."
            : cancellationState.error === "stale"
              ? "This booking is no longer eligible or already has a request. Refresh its persisted state."
              : "The cancellation request could not be confirmed."}
        </p>
      ) : null}

      {resolution.cancellation ? (
        <div className="mt-4 rounded-xl bg-stone-50 p-4">
          <h3 className="font-semibold">Cancellation request</h3>
          <p className="mt-2 text-sm leading-6">“{resolution.cancellation.reason}”</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Value label="Status" value={resolution.cancellation.disposition} />
            <Value label="Requested" value={formatManilaDateTime(resolution.cancellation.requested_at)} />
          </dl>
          {resolution.cancellation.decision ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <Value label="Decision" value={resolution.cancellation.decision.outcome} />
              <Value label="Reason" value={resolution.cancellation.decision.reason} />
              <Value label="Fee" value={phpFormatter.format(resolution.cancellation.decision.fee_amount)} />
              <Value label="Refund liability" value={phpFormatter.format(resolution.cancellation.decision.refund_liability_amount)} />
            </dl>
          ) : (
            <p className="mt-3 text-sm text-stone-600">Pending administrator review; the booking state remains authoritative.</p>
          )}
        </div>
      ) : null}

      {resolution.return_inspection ? (
        <div className="mt-5 rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">Persisted return facts</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Value label="Actual return" value={formatManilaDateTime(resolution.return_inspection.actual_at)} />
            <Value label="Expected return" value={formatManilaDateTime(resolution.return_inspection.expected_return_at)} />
            <Value label="Late fact" value={resolution.return_inspection.late_return ? "Yes" : "No"} />
            <Value label="Camera damage recorded" value={resolution.return_inspection.camera_has_damage ? "Yes" : "No"} />
            <Value label="Missing item recorded" value={resolution.return_inspection.has_missing_items ? "Yes" : "No"} />
          </dl>
          <ul className="mt-3 space-y-2 text-sm">
            {resolution.return_inspection.accessories.map((accessory) => (
              <li className="rounded-xl bg-stone-50 p-3" key={accessory.id}>
                {accessory.name} × {accessory.quantity}: {accessory.return_status}
              </li>
            ))}
          </ul>
          {resolution.return_inspection.photos.length > 0 ? (
            <div className="mt-4">
              <h4 className="font-semibold">Your private return photos</h4>
              <ul className="mt-2 space-y-2">
                {resolution.return_inspection.photos.map((photo, index) => (
                  <li className="rounded-xl bg-stone-50 p-3" key={photo.photo_id}>
                    <p className="text-sm">Photo {index + 1} · {Math.ceil(photo.byte_size / 1024)} KiB</p>
                    <form action={accessAction} className="mt-2">
                      <input name="bookingId" type="hidden" value={resolution.booking_id} />
                      <input name="photoId" type="hidden" value={photo.photo_id} />
                      <button className="min-h-11 font-semibold text-amber-900 underline disabled:opacity-60" disabled={accessPending} type="submit">Open for 60 seconds</button>
                    </form>
                  </li>
                ))}
              </ul>
              {accessState.status === "success" && accessState.signedUrl ? (
                <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={accessState.signedUrl} rel="noopener noreferrer" target="_blank">View authorized private photo</a>
              ) : accessState.status === "error" ? (
                <p className="mt-2 text-sm text-red-800" role="alert">The private photo could not be authorized from this owned booking.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {resolution.issue_decision ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold">Final issue outcome</h3>
          <p className="mt-2 text-sm leading-6">{resolution.issue_decision.customer_explanation}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Value label="Decision kind" value={resolution.issue_decision.decision_kind} />
            <Value label="Deposit deduction" value={phpFormatter.format(resolution.issue_decision.deduction_amount)} />
          </dl>
        </div>
      ) : null}

      {resolution.deposit.held_amount > 0 ? (
        <div className="mt-5 rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">Security-deposit outcome</h3>
          <p className="mt-2 text-sm text-stone-600">The deposit is tracked as a refundable liability, never rental revenue.</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Value label="Verified deposit held" value={phpFormatter.format(resolution.deposit.held_amount)} />
            <Value label="Approved deduction" value={phpFormatter.format(resolution.deposit.deduction_amount)} />
            <Value label="Externally refunded" value={phpFormatter.format(resolution.deposit.refunded_amount)} />
            <Value label="Still owed to you" value={phpFormatter.format(resolution.deposit.remaining_refund_liability)} />
            <Value
              label="Settlement status"
              value={resolution.deposit.status.replaceAll("_", " ")}
            />
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
