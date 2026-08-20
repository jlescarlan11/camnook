"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { requestBooking } from "@/features/bookings/actions/request-booking";
import { initialRequestBookingActionState } from "@/features/bookings/form-state";

export function RequestForm({
  camera,
  pickup,
  returnValue,
  returnHref,
  schedule,
}: {
  camera: string;
  pickup: string;
  returnValue: string;
  returnHref?: string;
  schedule?: {
    handoffTime: string;
    pickupDate: string;
    policyVersion: string;
    returnDate: string;
  };
}) {
  const [intendedUse, setIntendedUse] = useState("");
  const [expectedLocation, setExpectedLocation] = useState("");
  const [state, formAction, pending] = useActionState(
    requestBooking,
    initialRequestBookingActionState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <input name="camera" type="hidden" value={camera} />
      <input name="pickup" type="hidden" value={pickup} />
      <input name="return" type="hidden" value={returnValue} />
      {schedule ? (
        <>
          <input name="handoffTime" type="hidden" value={schedule.handoffTime} />
          <input name="pickupDate" type="hidden" value={schedule.pickupDate} />
          <input name="policyVersion" type="hidden" value={schedule.policyVersion} />
          <input name="returnDate" type="hidden" value={schedule.returnDate} />
        </>
      ) : null}
      <div>
        <label className="block text-sm font-medium" htmlFor="intendedUse">
          Intended use
        </label>
        <textarea
          aria-describedby={state.fieldErrors?.intendedUse ? "intended-use-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.intendedUse)}
          className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
          id="intendedUse"
          maxLength={1000}
          name="intendedUse"
          onChange={(event) => setIntendedUse(event.target.value)}
          required
          value={intendedUse}
        />
        {state.fieldErrors?.intendedUse ? (
          <p className="mt-2 text-sm text-red-700" id="intended-use-error" role="alert">
            {state.fieldErrors.intendedUse}
          </p>
        ) : null}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="expectedLocation">
          Expected shooting location
        </label>
        <input
          aria-describedby={state.fieldErrors?.expectedLocation ? "expected-location-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.expectedLocation)}
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
          id="expectedLocation"
          maxLength={500}
          name="expectedLocation"
          onChange={(event) => setExpectedLocation(event.target.value)}
          required
          value={expectedLocation}
        />
        {state.fieldErrors?.expectedLocation ? (
          <p className="mt-2 text-sm text-red-700" id="expected-location-error" role="alert">
            {state.fieldErrors.expectedLocation}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
          <p>
            {state.error === "profile_required"
              ? "Complete your profile before submitting this request."
              : state.error === "suspended"
                ? "This account is suspended and cannot submit requests. Contact CamNook for help."
                : state.error === "request_failed"
                  ? "We couldn’t confirm the request response. Check your account for a persisted request before retrying."
                  : state.error === "schedule_changed"
                    ? "The lender’s handoff schedule changed. Return to the listing and choose again."
                    : state.error === "unavailable"
                      ? "Those dates are no longer available. Return to the listing and choose another range."
                  : "Correct the highlighted fields and try again."}
          </p>
          {state.error === "request_failed" ? (
            <Link className="mt-2 inline-block font-semibold underline" href="/account">
              Check your account
            </Link>
          ) : state.error === "schedule_changed" || state.error === "unavailable" ? (
            <Link
              className="mt-2 inline-block font-semibold underline"
              href={returnHref ?? "/"}
            >
              Choose a new schedule
            </Link>
          ) : null}
        </div>
      ) : null}
      <button
        className="min-h-12 w-full rounded-xl bg-amber-500 px-5 py-3 font-semibold text-stone-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={pending}
        type="submit"
      >
        {pending ? "Submitting request…" : "Submit booking request"}
      </button>
      {pending ? (
        <span className="sr-only" role="status">
          Submitting your booking request.
        </span>
      ) : null}
    </form>
  );
}
