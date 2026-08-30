"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";

import { requestBooking } from "@/features/bookings/actions/request-booking";
import { initialRequestBookingActionState } from "@/features/bookings/form-state";
import {
  recommendMeetup,
  type RecommendMeetupState,
} from "@/features/meetups/actions/recommend-meetup";

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
  const [requestOperationId] = useState(() => crypto.randomUUID());
  const [expectedLocation, setExpectedLocation] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [confirmedReference, setConfirmedReference] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "locating" | "denied" | "unavailable"
  >("idle");
  const [recommendationState, recommendationAction, recommendationPending] =
    useActionState<RecommendMeetupState, FormData>(recommendMeetup, {
      status: "idle",
    });
  const [state, formAction, pending] = useActionState(
    requestBooking,
    initialRequestBookingActionState,
  );
  const meetupRequired = Boolean(schedule);
  const recommendation = recommendationState.recommendation;
  const meetupConfirmed =
    Boolean(recommendation?.reference) &&
    confirmedReference === recommendation?.reference;

  function scheduleFields(formData: FormData) {
    formData.set("camera", camera);
    if (schedule) {
      formData.set("handoffTime", schedule.handoffTime);
      formData.set("pickupDate", schedule.pickupDate);
      formData.set("policyVersion", schedule.policyVersion);
      formData.set("returnDate", schedule.returnDate);
    }
    return formData;
  }

  function useCurrentCity() {
    setConfirmedReference(null);
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const formData = scheduleFields(new FormData());
        formData.set("locationMode", "current");
        formData.set("accuracy", String(position.coords.accuracy));
        formData.set("latitude", String(position.coords.latitude));
        formData.set("longitude", String(position.coords.longitude));
        setLocationStatus("idle");
        startTransition(() => recommendationAction(formData));
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {meetupRequired && schedule ? (
        <section
          aria-labelledby="meetup-heading"
          className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
        >
          <h3 className="text-lg font-semibold" id="meetup-heading">
            Confirm a public meetup spot
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            CamNook uses your current city—not your street address—to recommend
            one public venue between you and the lender. Your precise position
            is discarded after the city lookup.
          </p>
          <button
            className="mt-4 min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={locationStatus === "locating" || recommendationPending}
            onClick={useCurrentCity}
            type="button"
          >
            {locationStatus === "locating" || recommendationPending
              ? "Finding a public meetup…"
              : "Use my current city"}
          </button>
          {locationStatus === "denied" || locationStatus === "unavailable" ? (
            <p className="mt-3 text-sm text-amber-900" role="status">
              {locationStatus === "denied"
                ? "Location permission was denied. Enter your city or municipality below."
                : "Your current city could not be detected. Enter it below instead."}
            </p>
          ) : null}

          <form action={recommendationAction} className="mt-5 border-t border-stone-200 pt-5">
            <input name="camera" type="hidden" value={camera} />
            <input name="handoffTime" type="hidden" value={schedule.handoffTime} />
            <input name="locationMode" type="hidden" value="manual" />
            <input name="pickupDate" type="hidden" value={schedule.pickupDate} />
            <input name="policyVersion" type="hidden" value={schedule.policyVersion} />
            <input name="returnDate" type="hidden" value={schedule.returnDate} />
            <label className="block text-sm font-medium" htmlFor="manualCity">
              City or municipality fallback
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                autoComplete="address-level2"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-2"
                id="manualCity"
                maxLength={80}
                name="manualCity"
                onChange={(event) => {
                  setManualCity(event.target.value);
                  setConfirmedReference(null);
                }}
                pattern="[A-Za-zÀ-ÖØ-öø-ÿ .'-]+"
                placeholder="e.g. Mandaue City"
                required
                value={manualCity}
              />
              <button
                className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60"
                disabled={recommendationPending}
                type="submit"
              >
                Recommend from city
              </button>
            </div>
          </form>

          {recommendationState.error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {recommendationState.error === "invalid_city"
                ? "Enter a valid Philippine city or municipality, not a street or residential address."
                : recommendationState.error === "invalid_location"
                  ? "The detected position was not accurate enough to identify a city. Use the city fallback."
                  : recommendationState.error === "schedule_changed"
                    ? "The schedule changed or became unavailable. Return to the listing and choose again."
                    : recommendationState.error === "authentication"
                      ? "Your session expired. Sign in again before requesting a meetup."
                      : "A public meetup recommendation is unavailable right now. Retry before submitting."}
            </p>
          ) : null}

          {recommendation ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-900">
                Confirmed renter city: <strong>{recommendation.renterCity}</strong>
              </p>
              <h4 className="mt-2 font-semibold">{recommendation.name}</h4>
              <p className="mt-1 break-words text-sm leading-6 text-stone-700">
                {recommendation.address}
              </p>
              <p className="mt-2 text-xs text-stone-600">{recommendation.attribution}</p>
              <p className="mt-1 text-xs text-stone-600">
                This recommendation expires at {recommendation.expiresAt}.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <form action={formAction} className="space-y-5">
      <input name="operationId" type="hidden" value={requestOperationId} />
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
      {meetupRequired ? (
        <>
          <input
            name="meetupConfirmed"
            type="hidden"
            value={meetupConfirmed ? "true" : "false"}
          />
          <input
            name="meetupReference"
            type="hidden"
            value={recommendation?.reference ?? ""}
          />
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
      {meetupRequired && recommendation ? (
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-stone-200 p-4">
          <input
            checked={meetupConfirmed}
            className="mt-1 h-5 w-5"
            onChange={(event) =>
              setConfirmedReference(
                event.target.checked ? recommendation.reference : null,
              )
            }
            type="checkbox"
          />
          <span className="text-sm leading-6">
            I confirm {recommendation.renterCity} as my city and reviewed
            {` ${recommendation.name}`} as the planned pickup and return meetup
            spot.
          </span>
        </label>
      ) : null}
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
                  : state.error === "request_limit"
                    ? "You already have 10 requests awaiting review. Wait for CamNook to decide one before submitting another."
                  : state.error === "schedule_changed"
                    ? "The lender’s handoff schedule changed. Return to the listing and choose again."
                    : state.error === "unavailable"
                      ? "Those dates are no longer available. Return to the listing and choose another range."
                      : state.error === "meetup_expired"
                        ? "The meetup recommendation expired or no longer matches this request. Generate and confirm a new recommendation."
                        : state.error === "meetup_required"
                          ? "Generate, review, and confirm the public meetup spot before submitting."
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
        disabled={pending || (meetupRequired && (!recommendation || !meetupConfirmed))}
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
    </div>
  );
}
