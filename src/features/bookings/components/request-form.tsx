"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { requestBooking } from "@/features/bookings/actions/request-booking";
import { initialRequestBookingActionState } from "@/features/bookings/form-state";
import {
  recommendMeetup,
  type RecommendMeetupState,
} from "@/features/meetups/actions/recommend-meetup";
import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";

export function recommendationBatchKey(
  recommendations: readonly { reference: string }[],
) {
  return recommendations.map((recommendation) => recommendation.reference).join("\u001f");
}

export function RequestForm({
  camera,
  pickup,
  returnValue,
  returnHref,
  schedule,
  savedOrigin,
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
  savedOrigin?: null | { areaName: string; precision: string; valid: boolean };
}) {
  const [intendedUse, setIntendedUse] = useState("");
  const [requestOperationId] = useState(() => crypto.randomUUID());
  const [expectedLocation, setExpectedLocation] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [confirmedReference, setConfirmedReference] = useState<string | null>(null);
  const [expandedRecommendationBatch, setExpandedRecommendationBatch] = useState<string | null>(null);
  const [invalidatedRecommendationBatch, setInvalidatedRecommendationBatch] = useState<string | null>(null);
  const firstAdditionalOptionRef = useRef<HTMLInputElement>(null);
  const [expiredRecommendationBatch, setExpiredRecommendationBatch] = useState<
    string | null
  >(null);
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
  const receivedRecommendations = recommendationState.recommendations ?? [];
  const receivedRecommendationBatch = recommendationBatchKey(receivedRecommendations);
  const recommendations =
    receivedRecommendationBatch &&
    receivedRecommendationBatch !== invalidatedRecommendationBatch
      ? receivedRecommendations
      : [];
  const recommendationExpiry = recommendations[0]?.expiresAt ?? null;
  const recommendationsExpired =
    recommendationExpiry !== null &&
    expiredRecommendationBatch === recommendationExpiry;
  const recommendationsExpanded = Boolean(recommendationExpiry) && expandedRecommendationBatch === recommendationExpiry;
  const visibleRecommendations = recommendationsExpanded
    ? recommendations
    : recommendations.slice(0, 3);
  const hiddenRecommendationCount = Math.max(0, recommendations.length - 3);
  const selectedRecommendation = recommendations.find(
    (recommendation) => recommendation.reference === selectedReference,
  );
  const meetupConfirmed =
    Boolean(selectedRecommendation?.reference) &&
    confirmedReference === selectedRecommendation?.reference;

  useEffect(() => {
    if (!recommendationExpiry) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setExpiredRecommendationBatch(recommendationExpiry);
      setSelectedReference(null);
      setConfirmedReference(null);
      setExpandedRecommendationBatch(null);
    }, Math.max(0, Date.parse(recommendationExpiry) - Date.now()));

    return () => window.clearTimeout(timeout);
  }, [recommendationExpiry]);

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

  function invalidateRecommendations() {
    setInvalidatedRecommendationBatch(receivedRecommendationBatch || null);
    setSelectedReference(null);
    setConfirmedReference(null);
    setExpandedRecommendationBatch(null);
  }

  function useCurrentCity() {
    invalidateRecommendations();
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

  function recommendFromManualCity(formData: FormData) {
    invalidateRecommendations();
    startTransition(() => recommendationAction(formData));
  }

  function recommendFromSavedOrigin() {
    if (!schedule || !savedOrigin?.valid) return;
    invalidateRecommendations();
    const formData = scheduleFields(new FormData());
    formData.set("locationMode", "saved");
    startTransition(() => recommendationAction(formData));
  }

  return (
    <div className="mt-6 space-y-6">
      {meetupRequired && schedule ? (
        <section
          aria-busy={recommendationPending}
          aria-labelledby="meetup-heading"
          className="rounded-2xl border border-stone-200 bg-stone-50 p-5"
        >
          <h3 className="text-lg font-semibold" id="meetup-heading">
            Confirm a public meetup spot
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            If you choose location suggestions, CamNook sends your position
            temporarily to Geoapify to confirm your city and to Mapbox to compare
            routes. It is not saved with the booking. You can use the city-only
            fallback instead; its route estimates are coarser.
          </p>
          {savedOrigin ? (
            <div className={`mt-4 rounded-xl border p-4 ${savedOrigin.valid ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="font-semibold">Saved default: {savedOrigin.areaName}</p>
              <p className="mt-1 text-sm text-stone-700">{savedOrigin.precision.replaceAll("_", " ")}. {savedOrigin.valid ? "Confirm it before recommendations are requested." : "This PSGC reference needs review and cannot be used."}</p>
              {savedOrigin.valid ? <button className="mt-3 min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={recommendationPending} onClick={recommendFromSavedOrigin} type="button">Use this location</button> : null}
            </div>
          ) : null}
          <button
            className="mt-4 min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={locationStatus === "locating" || recommendationPending}
            onClick={useCurrentCity}
            type="button"
          >
            {locationStatus === "locating" || recommendationPending
              ? "Finding public meetup options…"
              : "Allow location and suggest up to 5 places"}
          </button>
          <span aria-live="polite" className="sr-only">
            {recommendationPending
              ? "Finding public meetup options."
              : recommendationsExpired
                ? "The meetup suggestions expired. Generate new suggestions."
                : recommendations.length
                  ? `${recommendations.length} public meetup options are ready.`
                  : ""}
          </span>
          {locationStatus === "denied" || locationStatus === "unavailable" ? (
            <p className="mt-3 text-sm text-amber-900" role="status">
              {locationStatus === "denied"
                ? "Location permission was denied. Enter your city or municipality below."
                : "Your current city could not be detected. Enter it below instead."}
            </p>
          ) : null}

          <form action={recommendFromManualCity} className="mt-5 border-t border-stone-200 pt-5">
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
                disabled={locationStatus === "locating" || recommendationPending}
                id="manualCity"
                maxLength={80}
                name="manualCity"
                onChange={(event) => {
                  setManualCity(event.target.value);
                  invalidateRecommendations();
                }}
                pattern="[A-Za-zÀ-ÖØ-öø-ÿ .'-]+"
                placeholder="e.g. Mandaue City"
                required
                value={manualCity}
              />
              <button
                className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60"
                disabled={locationStatus === "locating" || recommendationPending}
                type="submit"
              >
                Suggest up to 5 places from city
              </button>
            </div>
          </form>

          <form action={recommendFromManualCity} className="mt-5 border-t border-stone-200 pt-5">
            <input name="camera" type="hidden" value={camera} />
            <input name="handoffTime" type="hidden" value={schedule.handoffTime} />
            <input name="locationMode" type="hidden" value="canonical" />
            <input name="pickupDate" type="hidden" value={schedule.pickupDate} />
            <input name="policyVersion" type="hidden" value={schedule.policyVersion} />
            <input name="returnDate" type="hidden" value={schedule.returnDate} />
            <PsgcAreaSelector onSelectionChange={() => {
              invalidateRecommendations();
            }} />
            <button className="mt-3 min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={recommendationPending} type="submit">Use this area once</button>
            <p className="mt-2 text-xs leading-5 text-stone-600">This one-time area does not replace your account default.</p>
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

          {recommendations.length ? (
            <div className="mt-5">
              {recommendationsExpired ? (
                <p
                  className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                  role="status"
                >
                  These meetup suggestions expired. Generate new suggestions before
                  submitting.
                </p>
              ) : null}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                <p>
                  Owner handoff origin: <strong>{recommendations[0].ownerCity}</strong>
                </p>
                <p>
                  Your confirmed city: <strong>{recommendations[0].renterCity}</strong>
                </p>
              </div>
              <fieldset className="mt-4 space-y-3">
                <legend className="font-semibold">Choose a public meetup place</legend>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  {recommendations[0].routeMode === "balanced"
                    ? "Ranked to balance advisory driving time for both people. "
                    : "Routing is temporarily unavailable, so these options use Geoapify’s deterministic public-place ranking without travel-time claims. "}
                  These are reviewed public venue categories, not live crowd or
                  safety evidence. Meet during operating hours in a staffed,
                  visible area.
                </p>
                <div className="space-y-3" id="additional-meetup-options">
                {visibleRecommendations.map((recommendation, index) => (
                  <label
                    className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 bg-white p-4 has-checked:border-stone-950 has-checked:ring-2 has-checked:ring-stone-200"
                    key={recommendation.reference}
                  >
                    <input
                      checked={selectedReference === recommendation.reference}
                      className="mt-1 h-5 w-5"
                      disabled={recommendationsExpired}
                      name="meetupOption"
                      onChange={() => {
                        setSelectedReference(recommendation.reference);
                        setConfirmedReference(null);
                      }}
                      ref={index === 3 ? firstAdditionalOptionRef : undefined}
                      type="radio"
                      value={recommendation.reference}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {recommendation.name}
                      </span>
                      <span className="mt-1 block break-words text-sm leading-6 text-stone-700">
                        {recommendation.address}
                      </span>
                      {recommendation.renterTravelMinutes !== null &&
                      recommendation.ownerTravelMinutes !== null ? (
                        <span className="mt-2 block text-xs text-stone-600">
                          {recommendation.routeEstimateApproximate ? "Approx. " : "About "}
                          {recommendation.renterTravelMinutes} min from you · {recommendation.ownerTravelMinutes} min from owner
                        </span>
                      ) : (
                        <span className="mt-2 block text-xs text-stone-600">
                          Travel times unavailable; this option is not route-ranked.
                        </span>
                      )}
                    </span>
                  </label>
                ))}
                </div>
                {hiddenRecommendationCount > 0 && !recommendationsExpanded ? (
                  <button
                    aria-controls="additional-meetup-options"
                    aria-expanded="false"
                    className="mt-3 min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold"
                    onClick={() => {
                      setExpandedRecommendationBatch(recommendationExpiry);
                      window.requestAnimationFrame(() => firstAdditionalOptionRef.current?.focus());
                    }}
                    type="button"
                  >
                    Show {hiddenRecommendationCount} more
                  </button>
                ) : null}
              </fieldset>
              <p className="mt-3 text-xs text-stone-600">
                {recommendations[0].attribution} · Suggestions expire at {recommendations[0].expiresAt}.
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
            value={selectedRecommendation?.reference ?? ""}
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
      {meetupRequired && selectedRecommendation ? (
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-stone-200 p-4">
          <input
            checked={meetupConfirmed}
            className="mt-1 h-5 w-5"
            onChange={(event) =>
              setConfirmedReference(
                event.target.checked ? selectedRecommendation.reference : null,
              )
            }
            type="checkbox"
          />
          <span className="text-sm leading-6">
            I confirm {selectedRecommendation.renterCity} as my city and reviewed
            {` ${selectedRecommendation.name}`} as the planned pickup and return meetup
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
        disabled={
          pending ||
          recommendationPending ||
          (meetupRequired && (!selectedRecommendation || !meetupConfirmed)) ||
          recommendationsExpired
        }
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
