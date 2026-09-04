"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";

import { requestBooking } from "@/features/bookings/actions/request-booking";
import { initialRequestBookingActionState } from "@/features/bookings/form-state";

type Schedule = { handoffTime: string; pickupDate: string; policyVersion: string; returnDate: string };
type ReviewSummary = {
  cameraName: string;
  dates: string;
  handoffTime: string;
  rentalAmount: string;
  securityDeposit: string;
  totalDue: string;
};

export function RequestForm({
  camera,
  profile,
  returnHref,
  schedule,
  summary,
}: {
  camera: string;
  profile?: null | { legalName: string; phone: string };
  returnHref?: string;
  schedule: Schedule;
  summary: ReviewSummary;
}) {
  const [state, formAction, pending] = useActionState(requestBooking, initialRequestBookingActionState);
  const [reviewing, setReviewing] = useState(false);
  const [operationId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({
    expectedLocation: state.values?.expectedLocation ?? "",
    intendedUse: state.values?.intendedUse ?? "",
    legalName: state.values?.legalName ?? profile?.legalName ?? "",
    phone: state.values?.phone ?? profile?.phone ?? "",
    preferredMeetupArea: state.values?.preferredMeetupArea ?? "",
  });
  const formRef = useRef<HTMLFormElement>(null);

  function update(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <form action={formAction} className="space-y-6" ref={formRef}>
      <input name="operationId" type="hidden" value={operationId} />
      <input name="camera" type="hidden" value={camera} />
      <input name="handoffTime" type="hidden" value={schedule.handoffTime} />
      <input name="pickupDate" type="hidden" value={schedule.pickupDate} />
      <input name="policyVersion" type="hidden" value={schedule.policyVersion} />
      <input name="returnDate" type="hidden" value={schedule.returnDate} />

      {!reviewing ? (
        <section aria-labelledby="details-heading">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Step 3 of 4</p>
          <h2 className="mt-2 text-2xl font-semibold" id="details-heading">Your details</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            We’ll save your name and phone for next time. The exact public meetup location is arranged only after approval.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={state.fieldErrors?.legalName}>
              <input autoComplete="name" className={inputClass} maxLength={160} name="legalName" onChange={(event) => update("legalName", event.target.value)} required value={values.legalName} />
            </Field>
            <Field label="Phone" error={state.fieldErrors?.phone}>
              <input autoComplete="tel" className={inputClass} maxLength={32} minLength={7} name="phone" onChange={(event) => update("phone", event.target.value)} required type="tel" value={values.phone} />
            </Field>
          </div>
          <div className="mt-5 space-y-5">
            <Field label="Preferred meetup area" error={state.fieldErrors?.preferredMeetupArea} help="We’ll arrange the exact public meetup location after your request is approved.">
              <input autoComplete="address-level2" className={inputClass} maxLength={160} name="preferredMeetupArea" onChange={(event) => update("preferredMeetupArea", event.target.value)} placeholder="e.g. IT Park, Cebu City" required value={values.preferredMeetupArea} />
            </Field>
            <Field label="Purpose" error={state.fieldErrors?.intendedUse}>
              <textarea className={`${inputClass} min-h-28`} maxLength={1000} name="intendedUse" onChange={(event) => update("intendedUse", event.target.value)} placeholder="Tell the owner what you plan to shoot" required value={values.intendedUse} />
            </Field>
            <Field label="Shooting city" error={state.fieldErrors?.expectedLocation}>
              <input autoComplete="address-level2" className={inputClass} maxLength={500} name="expectedLocation" onChange={(event) => update("expectedLocation", event.target.value)} placeholder="e.g. Cebu City" required value={values.expectedLocation} />
            </Field>
          </div>
          <button className="mt-7 min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white" onClick={() => {
            if (formRef.current?.reportValidity()) setReviewing(true);
          }} type="button">Continue to review</button>
        </section>
      ) : (
        <section aria-labelledby="review-heading">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Step 4 of 4</p>
          <h2 className="mt-2 text-2xl font-semibold" id="review-heading">Review &amp; request</h2>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <ReviewValue label="Camera" value={summary.cameraName} />
            <ReviewValue label="Dates" value={summary.dates} />
            <ReviewValue label="Handoff time" value={summary.handoffTime} />
            <ReviewValue label="Rental subtotal" value={summary.rentalAmount} />
            <ReviewValue label="Deposit" value={summary.securityDeposit} />
            <ReviewValue label="Total" value={summary.totalDue} />
            <ReviewValue label="Preferred meetup area" value={values.preferredMeetupArea} />
            <ReviewValue label="Name" value={values.legalName} />
            <ReviewValue label="Phone" value={values.phone} />
            <ReviewValue label="Purpose" value={values.intendedUse} />
            <ReviewValue label="Shooting city" value={values.expectedLocation} />
          </dl>
          <button className="mt-6 min-h-11 font-semibold text-amber-900 underline" onClick={() => setReviewing(false)} type="button">Edit your details</button>
          {state.error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
              {state.error === "suspended" ? "This account cannot submit requests. Contact CamNook for help." : state.error === "request_limit" ? "You already have 10 requests awaiting review." : state.error === "schedule_changed" || state.error === "unavailable" ? <>That schedule is no longer available. <Link className="font-semibold underline" href={returnHref ?? "/"}>Choose another schedule</Link>.</> : state.error === "profile_required" ? "We couldn’t save your contact details. Check them and retry." : state.error === "request_failed" ? "We couldn’t confirm the request. Check your bookings before retrying." : "Check your details and try again."}
            </div>
          ) : null}
          <button className="mt-6 min-h-12 w-full rounded-xl bg-amber-500 px-5 py-3 font-semibold text-stone-950 disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Requesting rental…" : "Request rental"}
          </button>
        </section>
      )}
    </form>
  );
}

const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100";

function Field({ children, error, help, label }: { children: ReactNode; error?: string; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal leading-5 text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" role="alert">{error}</span> : null}</label>;
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-4"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>;
}
