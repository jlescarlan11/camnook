"use client";

import { useActionState } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";
import {
  requestAdminConditionPhotoAccess,
  uploadConditionPhoto,
  type ConditionPhotoActionState,
} from "@/features/pickup/actions";

import {
  addIssueNote,
  decideCancellation,
  decideReturnReview,
  recordExternalRefund,
  recordReturn,
  resolveIssue,
  reverseExternalRefund,
  type ResolutionActionState,
} from "./actions";
import type { ResolutionDetail } from "./types";

const initialState: ResolutionActionState = { status: "idle" };
const initialPhotoState: ConditionPhotoActionState = { status: "idle" };

export type ResolutionOperationIds = {
  cancellation: string;
  issueNote: string;
  recordReturn: string;
  refund: string;
  resolveIssue: string;
  returnReview: string;
  reversals: Record<string, string>;
};

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function errorMessage(error: ResolutionActionState["error"]) {
  switch (error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "The booking changed or the referenced record is stale. Refresh before retrying.";
    case "blocked":
      return "An authoritative state, evidence, deposit, or accounting invariant blocked this action.";
    case "invalid":
      return "Review the submitted fields and authoritative facts.";
    case "policy_unavailable":
      return "This cancellation path remains disabled until the paid-cancellation policy is approved.";
    default:
      return "The committed outcome could not be confirmed. Refresh before retrying.";
  }
}

function resultMessage(result: ResolutionActionState["result"]) {
  switch (result) {
    case "cancelled":
      return "Cancellation accepted and inventory released.";
    case "declined":
      return "Cancellation declined with an immutable decision.";
    case "issue_opened":
      return "The booking is now in ISSUE_REVIEW.";
    case "note_saved":
      return "The private issue note was appended.";
    case "recorded":
      return "The physical return was recorded and is awaiting review.";
    case "refund_recorded":
      return "The completed external refund movement was recorded.";
    case "resolved":
      return "The issue decision and any deduction were recorded; the booking is complete.";
    case "reversed":
      return "An offsetting reversal was recorded; the original refund was not edited.";
    case "returned_clear":
      return "The clear return was completed with no deduction.";
    default:
      return "The operation completed.";
  }
}

export function ResolutionControls({
  actualAt,
  operationIds,
  resolution,
}: {
  actualAt: string;
  operationIds: ResolutionOperationIds;
  resolution: ResolutionDetail;
}) {
  const [cancellationState, cancellationAction, cancellationPending] =
    useActionState(decideCancellation, initialState);
  const [returnState, returnAction, returnPending] = useActionState(
    recordReturn,
    initialState,
  );
  const [reviewState, reviewAction, reviewPending] = useActionState(
    decideReturnReview,
    initialState,
  );
  const [noteState, noteAction, notePending] = useActionState(
    addIssueNote,
    initialState,
  );
  const [issueState, issueAction, issuePending] = useActionState(
    resolveIssue,
    initialState,
  );
  const [refundState, refundAction, refundPending] = useActionState(
    recordExternalRefund,
    initialState,
  );
  const [reversalState, reversalAction, reversalPending] = useActionState(
    reverseExternalRefund,
    initialState,
  );
  const [photoState, photoAction, photoPending] = useActionState(
    uploadConditionPhoto,
    initialPhotoState,
  );
  const [accessState, accessAction, accessPending] = useActionState(
    requestAdminConditionPhotoAccess,
    initialPhotoState,
  );
  const inspection = resolution.return_inspection;
  const hasIssue = Boolean(
    inspection?.camera_has_damage ||
      inspection?.has_missing_items ||
      inspection?.late_return,
  );
  const reversedRefundIds = new Set(
    resolution.refunds.flatMap((entry) =>
      entry.reversal_of_refund_record_id
        ? [entry.reversal_of_refund_record_id]
        : [],
    ),
  );

  return (
    <section
      aria-labelledby="resolution-controls-heading"
      className="mt-8 border-t border-stone-200 pt-7"
    >
      <h2 className="text-xl font-semibold" id="resolution-controls-heading">
        Return, cancellation, and deposit resolution
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Every transition and amount is explicit. A security deposit remains a
        liability; no late fee, damage deduction, or refund is inferred.
      </p>

      {resolution.cancellation ? (
        <div className="mt-6 rounded-2xl border border-stone-200 p-5">
          <h3 className="font-semibold">Cancellation request</h3>
          <p className="mt-2 text-sm text-stone-700">
            “{resolution.cancellation.reason}” · requested{" "}
            {formatManilaDateTime(resolution.cancellation.requested_at)}
          </p>
          {resolution.cancellation.decision ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Value
                label="Outcome"
                value={resolution.cancellation.decision.outcome}
              />
              <Value
                label="Reason"
                value={resolution.cancellation.decision.reason}
              />
              <Value
                label="Cancellation fee"
                value={phpFormatter.format(
                  resolution.cancellation.decision.fee_amount,
                )}
              />
              <Value
                label="Refund liability"
                value={phpFormatter.format(
                  resolution.cancellation.decision.refund_liability_amount,
                )}
              />
            </dl>
          ) : (
            <form action={cancellationAction} className="mt-4 space-y-4">
              <HiddenIds
                bookingId={resolution.booking_id}
                operationId={operationIds.cancellation}
              />
              <input
                name="requestId"
                type="hidden"
                value={resolution.cancellation.request_id}
              />
              <label className="block text-sm font-medium" htmlFor="cancellation-decision-reason">
                Decision reason
              </label>
              <textarea
                className="min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3"
                id="cancellation-decision-reason"
                maxLength={1000}
                minLength={2}
                name="reason"
                required
              />
              {!resolution.cancellation.acceptance_enabled ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Acceptance is disabled for paid/submitted states until the
                  paid-cancellation fee and refund policy is approved. Decline
                  remains available with an explicit reason.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  className="min-h-11 rounded-xl bg-red-800 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  disabled={
                    cancellationPending ||
                    !resolution.cancellation.acceptance_enabled
                  }
                  name="decision"
                  type="submit"
                  value="accept"
                >
                  Accept cancellation
                </button>
                <button
                  className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold disabled:opacity-60"
                  disabled={cancellationPending}
                  name="decision"
                  type="submit"
                  value="decline"
                >
                  Decline request
                </button>
              </div>
            </form>
          )}
          <ActionResult state={cancellationState} />
        </div>
      ) : null}

      {resolution.booking_state === "ACTIVE" ? (
        <form action={returnAction} className="mt-6 space-y-5 rounded-2xl border border-stone-200 p-5">
          <HiddenIds
            bookingId={resolution.booking_id}
            operationId={operationIds.recordReturn}
          />
          <h3 className="font-semibold">Record physical return</h3>
          <label className="block text-sm font-medium" htmlFor="return-actual-at">
            Actual return time (Asia/Manila)
          </label>
          <input
            className="min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
            defaultValue={actualAt}
            id="return-actual-at"
            name="actualAt"
            required
            step="1"
            type="datetime-local"
          />
          <label className="block text-sm font-medium" htmlFor="return-camera-serial">
            Serial observed on the returned camera
          </label>
          <input
            autoComplete="off"
            className="min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3"
            id="return-camera-serial"
            maxLength={160}
            name="cameraSerial"
            required
          />
          <fieldset className="space-y-3 rounded-xl bg-stone-50 p-4">
            <legend className="font-semibold">Contract accessories</legend>
            {resolution.expected_accessories.length === 0 ? (
              <p className="text-sm text-stone-600">No included accessories.</p>
            ) : (
              resolution.expected_accessories.map((accessory) => (
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center" key={accessory.id}>
                  <input name="accessoryId" type="hidden" value={accessory.id} />
                  <label className="text-sm font-medium" htmlFor={`return-accessory-${accessory.id}`}>
                    {accessory.name} × {accessory.quantity}
                  </label>
                  <select
                    className="min-h-11 rounded-xl border border-stone-300 bg-white px-3"
                    defaultValue=""
                    id={`return-accessory-${accessory.id}`}
                    name={`accessoryStatus-${accessory.id}`}
                    required
                  >
                    <option disabled value="">Select status</option>
                    <option value="returned">Returned</option>
                    <option value="missing">Missing</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>
              ))
            )}
          </fieldset>
          <label className="flex gap-3 text-sm leading-6">
            <input className="mt-1 size-5" name="cameraHasDamage" type="checkbox" value="yes" />
            <span>The camera itself has observed damage.</span>
          </label>
          <label className="block text-sm font-medium" htmlFor="return-condition-summary">
            Return condition report
          </label>
          <textarea
            className="min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3"
            id="return-condition-summary"
            maxLength={2000}
            minLength={2}
            name="conditionSummary"
            required
          />
          <label className="block text-sm font-medium" htmlFor="return-notes">
            Private notes (optional)
          </label>
          <textarea
            className="min-h-20 w-full rounded-xl border border-stone-300 px-4 py-3"
            id="return-notes"
            maxLength={2000}
            name="notes"
          />
          <button
            className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={returnPending}
            type="submit"
          >
            {returnPending ? "Rechecking and recording…" : "Record return for review"}
          </button>
          <ActionResult state={returnState} />
        </form>
      ) : null}

      {inspection ? (
        <div className="mt-6 rounded-2xl border border-stone-200 p-5">
          <h3 className="font-semibold">Immutable return inspection</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Value label="Actual return" value={formatManilaDateTime(inspection.actual_at)} />
            <Value label="Expected return" value={formatManilaDateTime(inspection.expected_return_at)} />
            <Value label="Late fact" value={inspection.late_return ? "Yes" : "No"} />
            <Value label="Camera damage" value={inspection.camera_has_damage ? "Observed" : "Not observed"} />
            <Value label="Missing inclusion" value={inspection.has_missing_items ? "Observed" : "Not observed"} />
            <Value label="Written condition" value={inspection.camera_condition_summary} />
          </dl>
          <ul className="mt-4 space-y-2 text-sm">
            {inspection.accessories.map((accessory) => (
              <li className="rounded-xl bg-stone-50 p-3" key={accessory.id}>
                {accessory.name} × {accessory.quantity}: {accessory.return_status}
              </li>
            ))}
          </ul>
          <ConditionEvidence
            accessAction={accessAction}
            accessPending={accessPending}
            accessState={accessState}
            bookingId={resolution.booking_id}
            conditionReportId={inspection.condition_report_id}
            photoAction={photoAction}
            photoPending={photoPending}
            photos={inspection.photos}
            photoState={photoState}
          />
        </div>
      ) : null}

      {resolution.booking_state === "RETURN_REVIEW" && inspection ? (
        <form action={reviewAction} className="mt-6 space-y-4 rounded-2xl border border-stone-200 p-5">
          <HiddenIds
            bookingId={resolution.booking_id}
            operationId={operationIds.returnReview}
          />
          <h3 className="font-semibold">Decide return review</h3>
          <input name="outcome" type="hidden" value={hasIssue ? "issue" : "clear"} />
          <p className="text-sm leading-6 text-stone-600">
            Recorded facts require the {hasIssue ? "ISSUE_REVIEW" : "clear completion"} path.
            Damage or missing-item paths require finalized private evidence.
          </p>
          <label className="block text-sm font-medium" htmlFor="return-review-note">
            {hasIssue ? "Private issue-opening note" : "Review note (optional)"}
          </label>
          <textarea
            className="min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3"
            id="return-review-note"
            maxLength={2000}
            minLength={hasIssue ? 2 : undefined}
            name="note"
            required={hasIssue}
          />
          <button
            className="min-h-12 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60"
            disabled={
              reviewPending ||
              ((inspection.camera_has_damage || inspection.has_missing_items) &&
                inspection.photos.length === 0)
            }
            type="submit"
          >
            {hasIssue ? "Open ISSUE_REVIEW" : "Clear return and complete"}
          </button>
          <ActionResult state={reviewState} />
        </form>
      ) : null}

      {resolution.booking_state === "ISSUE_REVIEW" ? (
        <div className="mt-6 space-y-6 rounded-2xl border border-red-200 bg-red-50/40 p-5">
          <div>
            <h3 className="font-semibold">Append-only issue notes</h3>
            {resolution.issue_notes.length > 0 ? (
              <ol className="mt-3 space-y-2 text-sm">
                {resolution.issue_notes.map((note) => (
                  <li className="rounded-xl bg-white p-3" key={note.note_id}>
                    {note.note} · {formatManilaDateTime(note.created_at)}
                  </li>
                ))}
              </ol>
            ) : null}
            <form action={noteAction} className="mt-4 space-y-3">
              <HiddenIds bookingId={resolution.booking_id} operationId={operationIds.issueNote} />
              <textarea className="min-h-20 w-full rounded-xl border border-stone-300 px-4 py-3" maxLength={2000} minLength={2} name="note" required />
              <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold disabled:opacity-60" disabled={notePending} type="submit">Append private note</button>
            </form>
            <ActionResult state={noteState} />
          </div>
          <form action={issueAction} className="space-y-4 border-t border-red-200 pt-5">
            <HiddenIds bookingId={resolution.booking_id} operationId={operationIds.resolveIssue} />
            <h3 className="font-semibold">Explicit issue decision</h3>
            <label className="block text-sm font-medium" htmlFor="issue-kind">Decision kind</label>
            <select className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4" id="issue-kind" name="decisionKind" required>
              <option value="damage">Damage</option>
              <option value="missing_item">Missing item</option>
              <option value="late_return">Late return</option>
              <option value="mixed">Mixed facts</option>
              <option value="other">Other documented issue</option>
            </select>
            <label className="block text-sm font-medium" htmlFor="issue-deduction">Manual deduction amount (PHP)</label>
            <input className="min-h-12 w-full rounded-xl border border-stone-300 px-4" defaultValue="0.00" id="issue-deduction" min="0" name="deductionAmount" required step="0.01" type="number" />
            <p className="text-sm text-stone-600">Maximum verified held deposit: {phpFormatter.format(resolution.deposit.held_amount)}. No formula is applied.</p>
            <label className="block text-sm font-medium" htmlFor="issue-internal-reason">Private internal reason and evidence basis</label>
            <textarea className="min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3" id="issue-internal-reason" maxLength={2000} minLength={2} name="internalReason" required />
            <label className="block text-sm font-medium" htmlFor="issue-customer-explanation">Renter-visible explanation</label>
            <textarea className="min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3" id="issue-customer-explanation" maxLength={500} minLength={2} name="customerExplanation" required />
            <button className="min-h-12 w-full rounded-xl bg-red-800 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={issuePending} type="submit">Record decision and complete booking</button>
          </form>
          <ActionResult state={issueState} />
        </div>
      ) : null}

      {resolution.issue_decision ? (
        <div className="mt-6 rounded-2xl border border-stone-200 p-5">
          <h3 className="font-semibold">Persisted issue decision</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Value label="Kind" value={resolution.issue_decision.decision_kind} />
            <Value label="Deduction" value={phpFormatter.format(resolution.issue_decision.deduction_amount)} />
            <Value label="Private reason" value={resolution.issue_decision.internal_reason} />
            <Value label="Renter explanation" value={resolution.issue_decision.customer_explanation} />
          </dl>
        </div>
      ) : null}

      {(resolution.booking_state === "COMPLETED" ||
        resolution.booking_state === "CANCELLED") &&
      resolution.deposit.held_amount > 0 ? (
        <div className="mt-6 rounded-2xl border border-stone-200 p-5">
          <h3 className="font-semibold">Deposit liability and external movements</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Value label="Verified held" value={phpFormatter.format(resolution.deposit.held_amount)} />
            <Value label="Approved deduction" value={phpFormatter.format(resolution.deposit.deduction_amount)} />
            <Value label="Recorded refunds" value={phpFormatter.format(resolution.deposit.refunded_amount)} />
            <Value label="Remaining liability" value={phpFormatter.format(resolution.deposit.remaining_refund_liability)} />
          </dl>
          {resolution.deposit.remaining_refund_liability > 0 ? (
            <form action={refundAction} className="mt-5 grid gap-4 sm:grid-cols-2">
              <HiddenIds bookingId={resolution.booking_id} operationId={operationIds.refund} />
              <Field label="Actual amount moved (PHP)" name="amount" type="number" defaultValue={resolution.deposit.remaining_refund_liability.toFixed(2)} />
              <Field label="Outgoing GCash reference" name="reference" />
              <Field label="Recipient name" name="recipientName" />
              <Field label="Actual movement time (Asia/Manila)" name="externalMovedAt" type="datetime-local" defaultValue={actualAt} />
              <button className="min-h-12 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={refundPending} type="submit">Record completed external refund</button>
            </form>
          ) : null}
          <ActionResult state={refundState} />
          {resolution.refunds.length > 0 ? (
            <ol className="mt-6 space-y-4 border-t border-stone-200 pt-5">
              {resolution.refunds.map((entry) => (
                <li className="rounded-xl bg-stone-50 p-4" key={entry.refund_record_id}>
                  <p className="font-medium">{entry.entry_kind === "refund" ? "Outgoing refund" : "Offsetting reversal"} · {phpFormatter.format(entry.amount)} · ref …{entry.reference_last4}</p>
                  <p className="mt-1 text-sm text-stone-600">Moved {formatManilaDateTime(entry.external_moved_at)}{entry.reversal_reason ? ` · ${entry.reversal_reason}` : ""}</p>
                  {entry.entry_kind === "refund" && !reversedRefundIds.has(entry.refund_record_id) ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-red-900">Record correction as reversal</summary>
                      <form action={reversalAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <HiddenIds bookingId={resolution.booking_id} operationId={operationIds.reversals[entry.refund_record_id]} />
                        <input name="refundRecordId" type="hidden" value={entry.refund_record_id} />
                        <Field label="Incoming reversal reference" name="reference" />
                        <Field label="Counterparty name" name="counterpartyName" />
                        <Field label="Actual reversal time (Asia/Manila)" name="externalMovedAt" type="datetime-local" defaultValue={actualAt} />
                        <Field label="Correction reason" name="reason" />
                        <button className="min-h-11 rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-900 disabled:opacity-60 sm:col-span-2" disabled={reversalPending} type="submit">Append offsetting reversal</button>
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          <ActionResult state={reversalState} />
        </div>
      ) : null}
    </section>
  );
}

function ConditionEvidence({
  accessAction,
  accessPending,
  accessState,
  bookingId,
  conditionReportId,
  photoAction,
  photoPending,
  photos,
  photoState,
}: {
  accessAction: (payload: FormData) => void;
  accessPending: boolean;
  accessState: ConditionPhotoActionState;
  bookingId: string;
  conditionReportId: string;
  photoAction: (payload: FormData) => void;
  photoPending: boolean;
  photos: NonNullable<ResolutionDetail["return_inspection"]>["photos"];
  photoState: ConditionPhotoActionState;
}) {
  const supersededPhotoIds = new Set(
    photos.flatMap((photo) =>
      photo.supersedes_photo_id ? [photo.supersedes_photo_id] : [],
    ),
  );
  const currentPhotoCount = photos.filter(
    (photo) => !supersededPhotoIds.has(photo.photo_id),
  ).length;

  return (
    <div className="mt-5 rounded-xl bg-stone-50 p-4">
      <h4 className="font-semibold">Private return evidence</h4>
      <form action={photoAction} className="mt-3 space-y-3">
        <input name="bookingId" type="hidden" value={bookingId} />
        <input name="conditionReportId" type="hidden" value={conditionReportId} />
        <input accept="image/jpeg,image/png" name="photo" required type="file" />
        <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold disabled:opacity-60" disabled={photoPending || currentPhotoCount >= 6} type="submit">Attach verified return photo</button>
      </form>
      {photoState.status !== "idle" ? (
        <p className={`mt-2 text-sm ${photoState.status === "success" ? "text-emerald-800" : "text-red-800"}`} role={photoState.status === "success" ? "status" : "alert"}>
          {photoState.status === "success" ? "Private return evidence was finalized." : "The evidence upload could not be safely finalized."}
        </p>
      ) : null}
      {photos.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {photos.map((photo, index) => (
            <li className="rounded-xl bg-white p-3" key={photo.photo_id}>
              <p className="text-sm">Return photo {index + 1} · {Math.ceil(photo.byte_size / 1024)} KiB</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <form action={accessAction}>
                  <input name="bookingId" type="hidden" value={bookingId} />
                  <input name="photoId" type="hidden" value={photo.photo_id} />
                  <input name="purpose" type="hidden" value="return_condition_review" />
                  <button className="min-h-11 font-semibold text-amber-900 underline disabled:opacity-60" disabled={accessPending} type="submit">Request audited 60-second access</button>
                </form>
                {supersededPhotoIds.has(photo.photo_id) ? (
                  <p className="py-2 text-sm text-stone-500">Historical superseded version</p>
                ) : (
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-amber-900 underline">Replace with a new version</summary>
                    <form action={photoAction} className="mt-2 space-y-2">
                      <input name="bookingId" type="hidden" value={bookingId} />
                      <input name="conditionReportId" type="hidden" value={conditionReportId} />
                      <input name="supersedesPhotoId" type="hidden" value={photo.photo_id} />
                      <input accept="image/jpeg,image/png" name="photo" required type="file" />
                      <button className="min-h-11 rounded-xl border border-stone-300 px-3 py-2 text-sm font-semibold" disabled={photoPending} type="submit">Upload versioned replacement</button>
                    </form>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-stone-600">No finalized return photos.</p>
      )}
      {accessState.status === "success" && accessState.signedUrl ? (
        <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={accessState.signedUrl} rel="noopener noreferrer" target="_blank">Open authorized return evidence</a>
      ) : accessState.status === "error" ? (
        <p className="mt-2 text-sm text-red-800" role="alert">Evidence access could not be authorized.</p>
      ) : null}
    </div>
  );
}

function HiddenIds({ bookingId, operationId }: { bookingId: string; operationId: string }) {
  return (
    <>
      <input name="bookingId" type="hidden" value={bookingId} />
      <input name="operationId" type="hidden" value={operationId} />
    </>
  );
}

function Field({ defaultValue, label, name, type = "text" }: { defaultValue?: number | string; label: string; name: string; type?: "datetime-local" | "number" | "text" }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3" defaultValue={defaultValue} min={type === "number" ? 0 : undefined} name={name} required step={type === "number" ? "0.01" : type === "datetime-local" ? "1" : undefined} type={type} />
    </label>
  );
}

function ActionResult({ state }: { state: ResolutionActionState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`mt-4 rounded-xl border p-3 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} role={state.status === "success" ? "status" : "alert"}>
      {state.status === "success" ? resultMessage(state.result) : errorMessage(state.error)}
    </p>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
