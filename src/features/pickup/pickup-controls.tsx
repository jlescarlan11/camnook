"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";

import {
  completePickup,
  requestAdminConditionPhotoAccess,
  uploadConditionPhoto,
  type ConditionPhotoActionState,
  type PickupCompletionActionState,
} from "./actions";
import type { PickupDetail } from "./types";

const initialCompletionState: PickupCompletionActionState = { status: "idle" };
const initialPhotoState: ConditionPhotoActionState = { status: "idle" };

function completionError(error: PickupCompletionActionState["error"]) {
  switch (error) {
    case "unauthorized":
      return "Administrator authorization is required.";
    case "stale":
      return "Another operation changed this booking. Refresh its persisted state.";
    case "blocked":
      return "Pickup is blocked because an authoritative identity, contract, payment, serial, or checklist fact no longer matches.";
    case "invalid":
      return "Review every required pickup field and try again.";
    default:
      return "The committed outcome could not be confirmed. Refresh before retrying.";
  }
}

export function PickupControls({
  actualAt,
  operationId,
  pickup,
}: {
  actualAt: string;
  operationId: string;
  pickup: PickupDetail;
}) {
  const [completionState, completionAction, completionPending] = useActionState(
    completePickup,
    initialCompletionState,
  );
  const [photoState, photoAction, photoPending] = useActionState(
    uploadConditionPhoto,
    initialPhotoState,
  );
  const [accessState, accessAction, accessPending] = useActionState(
    requestAdminConditionPhotoAccess,
    initialPhotoState,
  );
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (completionState.status !== "idle") resultRef.current?.focus();
  }, [completionState.status]);

  if (pickup.booking_state === "CONFIRMED") {
    return (
      <section className="mt-8 border-t border-stone-200 pt-7" aria-labelledby="pickup-checklist-heading">
        <h2 className="text-xl font-semibold" id="pickup-checklist-heading">Complete pickup checklist</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          The database locks this booking and rechecks current identity, signed contract,
          verified payment, observed serial, every inclusion, and the written report before ACTIVE.
        </p>
        {!pickup.eligibility.eligible ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            Automated eligibility is no longer current. Pickup is disabled and the database will fail closed.
          </p>
        ) : null}
        <form action={completionAction} className="mt-5 space-y-5">
          <input name="bookingId" type="hidden" value={pickup.booking_id} />
          <input name="operationId" type="hidden" value={operationId} />
          <label className="block text-sm font-medium" htmlFor="pickup-actual-at">Actual pickup time (Asia/Manila)</label>
          <input className="min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3" defaultValue={actualAt} id="pickup-actual-at" name="actualAt" required type="datetime-local" />
          {completionState.fieldErrors?.actualAt ? <p className="text-sm text-red-800">{completionState.fieldErrors.actualAt}</p> : null}

          <fieldset className="space-y-3 rounded-2xl border border-stone-200 p-5">
            <legend className="px-2 font-semibold">Named renter and original ID</legend>
            <p className="text-sm text-stone-600">Expected renter: {pickup.renter_legal_name}. Current verified {pickup.verification.id_type} expires {pickup.verification.document_expiration_date}.</p>
            <Checklist name="namedRenter" value="confirmed-named-renter">The named contract renter is physically present; no representative or substitute is collecting.</Checklist>
            <Checklist name="originalIdChecked" value="confirmed-original-id">I inspected the original physical ID.</Checklist>
            <Checklist name="originalIdMatched" value="confirmed-id-match">The original ID matches the named renter and current verified identity.</Checklist>
          </fieldset>

          <div>
            <label className="block text-sm font-medium" htmlFor="pickup-camera-serial">Serial observed on camera</label>
            <p className="mt-1 text-sm text-stone-600">Enter the physical serial. The database compares it with the private camera and current contract snapshots.</p>
            <input autoComplete="off" className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 px-4 py-3" id="pickup-camera-serial" maxLength={160} name="cameraSerial" required />
            {completionState.fieldErrors?.cameraSerial ? <p className="mt-2 text-sm text-red-800">{completionState.fieldErrors.cameraSerial}</p> : null}
          </div>

          <fieldset className="space-y-3 rounded-2xl border border-stone-200 p-5">
            <legend className="px-2 font-semibold">Included accessories</legend>
            {pickup.accessories.length === 0 ? <p className="text-sm text-stone-600">The signed contract has no included accessories.</p> : pickup.accessories.map((accessory) => (
              <Checklist key={accessory.id} name="accessoryId" value={accessory.id}>{accessory.name} × {accessory.quantity} is present.</Checklist>
            ))}
          </fieldset>

          <div>
            <label className="block text-sm font-medium" htmlFor="pickup-condition-summary">Starting condition report</label>
            <textarea className="mt-2 min-h-32 w-full rounded-xl border border-stone-300 px-4 py-3" id="pickup-condition-summary" maxLength={2000} minLength={2} name="conditionSummary" required />
            {completionState.fieldErrors?.conditionSummary ? <p className="mt-2 text-sm text-red-800">{completionState.fieldErrors.conditionSummary}</p> : null}
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="pickup-notes">Private handoff notes (optional)</label>
            <textarea className="mt-2 min-h-24 w-full rounded-xl border border-stone-300 px-4 py-3" id="pickup-notes" maxLength={2000} name="notes" />
          </div>
          <button className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={!pickup.eligibility.eligible || completionPending} type="submit">
            {completionPending ? "Rechecking and recording pickup…" : "Complete pickup and mark ACTIVE"}
          </button>
        </form>
        {completionState.status !== "idle" ? (
          <div className={`mt-5 rounded-xl border p-4 text-sm ${completionState.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} ref={resultRef} role={completionState.status === "success" ? "status" : "alert"} tabIndex={-1}>
            {completionState.status === "success" ? "Pickup was recorded exactly once. The persisted booking is ACTIVE." : completionError(completionState.error)}
          </div>
        ) : null}
      </section>
    );
  }

  if (!pickup.handoff) return null;

  return (
    <section className="mt-8 border-t border-stone-200 pt-7" aria-labelledby="pickup-result-heading">
      <h2 className="text-xl font-semibold" id="pickup-result-heading">Persisted pickup handoff</h2>
      <p className="mt-2 text-sm text-emerald-900">ACTIVE since the recorded physical pickup at {formatManilaDateTime(pickup.handoff.actual_at)}.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Status label="Named renter and original ID" value="Checked and matched" />
        <Status label="Camera serial" value="Checked against private authority" />
        <Status label="Included accessories" value="Every contract inclusion confirmed" />
        <Status label="Written condition" value={pickup.handoff.condition_summary} />
      </dl>

      <div className="mt-7 rounded-2xl border border-stone-200 p-5">
        <h3 className="font-semibold">Optional private condition photos</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">The written report is already valid. A photo uses an opaque no-overwrite path and is limited to 5 MiB JPEG/PNG.</p>
        <form action={photoAction} className="mt-4 space-y-3">
          <input name="bookingId" type="hidden" value={pickup.booking_id} />
          <input name="conditionReportId" type="hidden" value={pickup.handoff.condition_report_id} />
          <label className="block text-sm font-medium" htmlFor="pickup-condition-photo">Condition photo</label>
          <input accept="image/jpeg,image/png" className="block w-full text-sm" id="pickup-condition-photo" name="photo" required type="file" />
          <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold disabled:opacity-60" disabled={photoPending || pickup.handoff.photos.length >= 6} type="submit">{photoPending ? "Verifying and saving…" : "Attach private photo"}</button>
        </form>
        {photoState.status !== "idle" ? <p className={`mt-3 text-sm ${photoState.status === "success" ? "text-emerald-800" : "text-red-800"}`} role={photoState.status === "success" ? "status" : "alert"}>{photoState.status === "success" ? "The immutable private photo was verified and attached." : photoState.fieldErrors?.photo ?? "The photo could not be safely finalized. Retry from persisted state."}</p> : null}

        {pickup.handoff.photos.length > 0 ? (
          <ul className="mt-5 space-y-3">
            {pickup.handoff.photos.map((photo, index) => (
              <li className="rounded-xl bg-stone-50 p-4" key={photo.photo_id}>
                <p className="text-sm font-medium">Condition photo {index + 1} · {Math.ceil(photo.byte_size / 1024)} KiB</p>
                <form action={accessAction} className="mt-2">
                  <input name="bookingId" type="hidden" value={pickup.booking_id} />
                  <input name="photoId" type="hidden" value={photo.photo_id} />
                  <button className="min-h-11 font-semibold text-amber-900 underline" disabled={accessPending} type="submit">Request audited 60-second access</button>
                </form>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-stone-600">No photos attached. This does not invalidate the handoff.</p>}
        {accessState.status === "success" && accessState.signedUrl ? (
          <a className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={accessState.signedUrl} rel="noopener noreferrer" target="_blank">View authorized private photo</a>
        ) : accessState.status === "error" ? <p className="mt-3 text-sm text-red-800" role="alert">Private photo access could not be authorized.</p> : null}
      </div>
    </section>
  );
}

function Checklist({ children, name, value }: { children: ReactNode; name: string; value: string }) {
  return <label className="flex gap-3 text-sm leading-6"><input className="mt-1 size-5 shrink-0" name={name} required type="checkbox" value={value} /><span>{children}</span></label>;
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-4"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}
