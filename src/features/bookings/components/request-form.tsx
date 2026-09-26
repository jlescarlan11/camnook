"use client";

import { meetupMapUrl, type MeetupPlace } from "@/features/meetups/places";
import { unstable_rethrow, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckoutProgress } from "./checkout-progress";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode, useSyncExternalStore } from "react";

import { requestBooking, type RequestBookingActionState } from "@/features/bookings/actions/request-booking";
import { clearRequestDraft, readRequestDraft, readRequestOperation, writeRequestDraft } from "../request-draft";
import { initialRequestBookingActionState } from "@/features/bookings/form-state";
import { PhilippineMobileInput } from "@/components/philippine-mobile-input";
import { mobileInputDigits, normalizePhilippineMobile } from "@/lib/phone/philippine-mobile";

type Schedule = { handoffTime: string; pickupDate: string; policyVersion: string; returnDate: string };
type ReviewSummary = {
  cameraName: string;
  dates: string;
  handoffTime: string;
  rentalAmount: string;
  securityDeposit: string;
  totalDue: string;
};

const subscribe = () => () => {};

export function RequestForm(props: RequestFormProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (props.draftKey && !hydrated) return <>
    {props.checkoutHref ? <CheckoutProgress step={3} editHref={props.checkoutHref} /> : null}
    <p role="status">Loading your rental plans…</p>
  </>;
  return <RequestFormContent key={`${props.draftKey ?? props.camera}:${props.schedule.pickupDate}:${props.schedule.returnDate}:${props.schedule.handoffTime}:${props.schedule.policyVersion}`} {...props} />;
}

type RequestFormProps = {
  draftKey?: string;
  camera: string;
  meetupPlaces?: MeetupPlace[] | null;
  checkoutHref?: string;
  profile?: null | {
    defaultAddress?: null | { areaName: string; valid: boolean };
    legalName: string;
    phone: string;
  };
  returnHref?: string;
  schedule: Schedule;
  summary: ReviewSummary;
};

function RequestFormContent({
  draftKey,
  camera,
  meetupPlaces = [],
  checkoutHref,
  profile,
  returnHref,
  schedule,
  summary,
}: RequestFormProps) {
  const router = useRouter();
  const scheduleIdentity = JSON.stringify([schedule.pickupDate, schedule.returnDate, schedule.handoffTime, schedule.policyVersion]);
  const [draft] = useState(() => readRequestDraft(draftKey, scheduleIdentity));
  const [submitted, setSubmitted] = useState(Boolean(draft?.submitted && draft.schedule === scheduleIdentity));
  const [lockedPlace, setLockedPlace] = useState(draft?.submitted && draft.schedule === scheduleIdentity ? draft.place : null);
  const [placeChoice, setPlaceChoice] = useState(() =>
    meetupPlaces?.some(place => `${place.id}:${place.version}` === draft?.placeChoice) ? draft!.placeChoice : "",
  );
  const selectedPlace = submitted && lockedPlace ? lockedPlace : meetupPlaces?.find(p => `${p.id}:${p.version}` === placeChoice);
  const [reviewing, setReviewing] = useState(submitted);
  const [operationId] = useState(() => readRequestOperation(draftKey, scheduleIdentity) ?? (draft?.schedule === scheduleIdentity ? draft.operationId : crypto.randomUUID()));
  const [values, setValues] = useState({
    expectedLocation: draft?.values.expectedLocation ?? "",
    intendedUse: draft?.values.intendedUse ?? "",
    legalName: draft && (submitted || draft.profile.legalName === (profile?.legalName ?? "")) ? draft.values.legalName : profile?.legalName ?? "",
    phone: mobileInputDigits(draft && (submitted || draft.profile.phone === (profile?.phone ?? "")) ? draft.values.phone : profile?.phone ?? ""),
  });
  function persistDraft(wasSubmitted: boolean) {
    writeRequestDraft(draftKey, {
      operationId, schedule: scheduleIdentity, placeChoice, values,
      submitted: wasSubmitted, place: selectedPlace ?? null,
      profile: { legalName: profile?.legalName ?? "", phone: profile?.phone ?? "" },
    });
  }
  const [state, formAction, pending] = useActionState(async (previous: RequestBookingActionState, data: FormData) => {
    // Record the payload before dispatch: a lost action response must recover the
    // same operation and arguments, even after changing dates or refreshing.
    setLockedPlace(selectedPlace ?? null);
    setSubmitted(true);
    persistDraft(true);
    let result: RequestBookingActionState;
    try {
      result = await requestBooking(previous, data);
    } catch (error) {
      unstable_rethrow(error);
      // A response that never reached the client can follow a committed request.
      // Keep the operation locked so retry remains idempotent.
      result = { status: "error", error: "request_failed", retryUnchanged: true };
    }
    if (result.status === "success" && result.bookingId) {
      clearRequestDraft(draftKey, scheduleIdentity);
      router.push(`/account/bookings/${result.bookingId}?requested=1`);
    } else {
      // A pre-booking failure cannot resolve an earlier uncertain submission.
      const remainsSubmitted = result.retryUnchanged ?? submitted;
      setSubmitted(remainsSubmitted);
      persistDraft(remainsSubmitted);
    }
    if (result.error === "meetup_changed") { setPlaceChoice(""); setReviewing(false); router.refresh(); }
    if (
      scheduleFieldError(result.fieldErrors) ||
      (result.fieldErrors && (
        result.fieldErrors.legalName || result.fieldErrors.phone ||
        result.fieldErrors.meetupPlace || result.fieldErrors.intendedUse ||
        result.fieldErrors.expectedLocation
      ))
    ) setReviewing(false);
    return result;
  }, initialRequestBookingActionState);
  useEffect(() => {
    if (state.status === "success") return;
    writeRequestDraft(draftKey, {
      operationId, schedule: scheduleIdentity, placeChoice, values,
      submitted, place: selectedPlace ?? null,
      profile: { legalName: profile?.legalName ?? "", phone: profile?.phone ?? "" },
    });
  }, [draftKey, operationId, scheduleIdentity, placeChoice, values, profile?.legalName, profile?.phone, state.status, submitted, selectedPlace]);
  const formRef = useRef<HTMLFormElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(reviewing);

  useEffect(() => {
    const form = formRef.current;
    // Action completion triggers a native reset even for returned errors. Keep
    // the reviewed radio selection valid for retry; state owns all field values.
    const preserveDraft = (event: Event) => event.preventDefault();
    form?.addEventListener("reset", preserveDraft);
    return () => form?.removeEventListener("reset", preserveDraft);
  }, []);

  useEffect(() => {
    if (previousStep.current === reviewing) return;
    previousStep.current = reviewing;
    (reviewing ? reviewHeadingRef : detailsHeadingRef).current?.focus();
  }, [reviewing]);

  function update(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }
  const scheduleError = scheduleFieldError(state.fieldErrors);

  return (
    <form className={checkoutHref ? "checkout-request" : "space-y-6"} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      if (!reviewing) {
        if (formRef.current?.reportValidity() && selectedPlace) setReviewing(true);
        return;
      }
      // Dispatch explicitly so React does not reset the hidden required radio
      // after a returned error, which would silently prevent retry submission.
      const data = new FormData(event.currentTarget);
      startTransition(() => formAction(data));
    }} ref={formRef}>
      <input name="operationId" type="hidden" value={operationId} />
      <input name="meetupPlaceId" type="hidden" value={selectedPlace?.id ?? ""} />
      <input name="meetupPlaceVersion" type="hidden" value={selectedPlace?.version ?? ""} />
      <input name="camera" type="hidden" value={camera} />
      <input name="handoffTime" type="hidden" value={schedule.handoffTime} />
      <input name="pickupDate" type="hidden" value={schedule.pickupDate} />
      <input name="policyVersion" type="hidden" value={schedule.policyVersion} />
      <input name="returnDate" type="hidden" value={schedule.returnDate} />

        {checkoutHref ? <CheckoutProgress step={3} editHref={checkoutHref} /> : <ol className="flex gap-5 text-sm font-semibold text-[#0b4f9c]" aria-label="Checkout progress">
          <li aria-current={!reviewing ? "step" : undefined}>1. Details</li>
          <li aria-current={reviewing ? "step" : undefined}>2. Review</li>
        </ol>}
        <section aria-labelledby="details-heading" hidden={reviewing}>
          <h2 className="text-2xl font-semibold" id="details-heading" ref={detailsHeadingRef} tabIndex={-1}>{checkoutHref ? "Your rental plans" : "Your details"}</h2>
          {checkoutHref ? <p className="checkout-section-intro">A few details to help the owner review your request.</p> : null}
          {scheduleError ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
              {scheduleError} <Link className="font-semibold underline" href={returnHref ?? "/"}>Choose another schedule</Link>.
            </div>
          ) : null}
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field error={state.fieldErrors?.legalName} errorId="request-legal-name-error" label="Name">
              <input aria-describedby={state.fieldErrors?.legalName ? "request-legal-name-error" : undefined} aria-invalid={state.fieldErrors?.legalName ? true : undefined} autoComplete="name" className={inputClass} maxLength={160} name="legalName" onChange={(event) => update("legalName", event.target.value)} required value={values.legalName} />
            </Field>
            <Field error={state.fieldErrors?.phone} errorId="request-phone-error" label="Phone">
              <PhilippineMobileInput aria-describedby={state.fieldErrors?.phone ? "request-phone-error" : undefined} aria-invalid={state.fieldErrors?.phone ? true : undefined} aria-label="Phone" name="phone" onChange={(digits) => update("phone", digits)} required value={values.phone} />
            </Field>
          </div>
          <div className="mt-5 space-y-5">
            <fieldset aria-describedby={state.fieldErrors?.meetupPlace || state.error === "meetup_changed" ? "request-meetup-place-error" : undefined} aria-invalid={state.fieldErrors?.meetupPlace || state.error === "meetup_changed" ? true : undefined} className="space-y-3" disabled={submitted}>
              <legend className="mb-3 font-semibold">Choose your meetup place</legend>
              <p className="text-sm text-stone-500">Pickup and return use the same place, subject to owner approval.</p>
              {meetupPlaces === null ? <p role="alert">Meetup places could not be loaded. <button className="underline" type="button" onClick={() => router.refresh()}>Try again</button></p> : !meetupPlaces.length ? <p role="status">This camera has no meetup places available. New rental requests are unavailable.</p> : meetupPlaces.map(place => <div className="rounded-lg border border-stone-200 p-4 has-[:checked]:border-[#0b4f9c]" key={`${place.id}:${place.version}`}>
                <label className="flex cursor-pointer gap-3"><input required name="meetupChoice" type="radio" value={`${place.id}:${place.version}`} checked={selectedPlace?.id === place.id} onChange={event => setPlaceChoice(event.target.value)} /><span><strong>{place.name}</strong><span className="mt-1 block text-sm">{place.address}</span>{place.arrival_instructions ? <span className="mt-2 block text-sm text-stone-600">{place.arrival_instructions}</span> : null}</span></label>
                <a className="mt-2 inline-flex min-h-11 items-center text-sm underline" href={meetupMapUrl(place.latitude,place.longitude)} target="_blank" rel="noreferrer">View on map</a>
                {place.attribution ? <p className="text-xs text-stone-500">{place.attribution}</p> : null}
              </div>)}
              {state.fieldErrors?.meetupPlace || state.error === "meetup_changed" ? <p id="request-meetup-place-error" role="alert" className="text-sm text-red-800">{state.fieldErrors?.meetupPlace ?? "Meetup choices changed. Choose a current place before continuing."}</p> : null}
            </fieldset>
            <Field error={state.fieldErrors?.intendedUse} errorId="request-intended-use-error" label="Purpose">
              <textarea aria-describedby={state.fieldErrors?.intendedUse ? "request-intended-use-error" : undefined} aria-invalid={state.fieldErrors?.intendedUse ? true : undefined} className={`${inputClass} min-h-28`} maxLength={1000} name="intendedUse" onChange={(event) => update("intendedUse", event.target.value)} placeholder="Tell the owner what you plan to shoot" required value={values.intendedUse} />
            </Field>
            <Field error={state.fieldErrors?.expectedLocation} errorId="request-expected-location-error" label="Shooting city">
              <input aria-describedby={state.fieldErrors?.expectedLocation ? "request-expected-location-error" : undefined} aria-invalid={state.fieldErrors?.expectedLocation ? true : undefined} autoComplete="address-level2" className={inputClass} maxLength={500} name="expectedLocation" onChange={(event) => update("expectedLocation", event.target.value)} placeholder="e.g. Cebu City" required value={values.expectedLocation} />
            </Field>
          </div>
          <button disabled={Boolean(scheduleError) || !meetupPlaces?.length} className="button-primary mt-7 w-full disabled:opacity-60" onClick={() => {
            if (formRef.current?.reportValidity() && selectedPlace) setReviewing(true);
          }} type="button">Review rental request</button>
        </section>
        <section aria-labelledby="review-heading" hidden={!reviewing}>
          <h2 className="mt-2 text-2xl font-semibold" id="review-heading" ref={reviewHeadingRef} tabIndex={-1}>Review</h2>
          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!checkoutHref ? <>
            <ReviewValue label="Camera" value={summary.cameraName} />
            <ReviewValue label="Dates" value={summary.dates} />
            <ReviewValue label="Handoff time" value={summary.handoffTime} />
            <ReviewValue label="Rental subtotal" value={summary.rentalAmount} />
            <ReviewValue label="Security deposit" value={summary.securityDeposit} />
            <ReviewValue label="Estimated total" value={summary.totalDue} />
            </> : null}
            <ReviewValue label="Pickup and return" value={selectedPlace ? `${selectedPlace.name} — ${selectedPlace.address}${selectedPlace.arrival_instructions ? ` · ${selectedPlace.arrival_instructions}` : ""}` : "Choose a meetup place"} />
            <ReviewValue label="Name" value={values.legalName} />
            <ReviewValue label="Phone" value={normalizePhilippineMobile(values.phone) ?? ""} />
            <ReviewValue label="Purpose" value={values.intendedUse} />
            <ReviewValue label="Shooting city" value={values.expectedLocation} />
          </dl>
          <button className="mt-6 min-h-11 font-semibold text-amber-900 underline" disabled={pending || submitted || state.status === "success"} onClick={() => setReviewing(false)} type="button">Edit your details</button>
          {state.error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
              {state.error === "suspended" ? "This account cannot submit requests. Contact CamNook for help." : state.error === "kyc_required" ? <>Your KYC details need attention. <Link className="font-semibold underline" href="/account/profile#renter-details">Review your renter details</Link>.</> : state.error === "request_limit" ? "You already have 10 requests awaiting review." : state.error === "schedule_changed" || state.error === "unavailable" ? <>That schedule is no longer available. <Link className="font-semibold underline" href={returnHref ?? "/"}>Choose another schedule</Link>.</> : state.error === "profile_required" ? "We couldn’t save your contact details. Check them and retry." : state.error === "request_failed" ? <>We couldn’t confirm the request. <Link className="font-semibold underline" href="/account">Check your bookings</Link> before retrying.</> : "Check your details and try again."}
            </div>
          ) : null}
          {submitted && !pending && state.status !== "success" ? (
            <p className="mt-4 text-sm text-stone-600" role="status">The last submission is unconfirmed. Retry these unchanged details to check or complete the same request.</p>
          ) : null}
          {state.status === "success" && state.bookingId ? (
            <p className="mt-5 text-sm text-emerald-900" role="status">
              Your booking request was saved. <Link className="font-semibold underline" href={`/account/bookings/${state.bookingId}?requested=1`}>View your booking</Link>.
            </p>
          ) : null}
          <p className="mt-5 text-sm text-[#754000]">Estimate only—not reserved. Submitting sends a rental request for owner review; no payment is taken here.</p>
          <button className="button-primary mt-6 w-full disabled:opacity-60" disabled={pending || state.status === "success" || !selectedPlace} type="submit">
            {pending ? "Requesting rental…" : "Submit rental request"}
          </button>
        </section>
    </form>
  );
}

const inputClass = "mt-2 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-[#0b4f9c] focus:ring-4 focus:ring-[#c9dcfb]";

function Field({ children, error, errorId, help, label }: { children: ReactNode; error?: string; errorId?: string; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal leading-5 text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" id={errorId} role="alert">{error}</span> : null}</label>;
}

function scheduleFieldError(fieldErrors: RequestBookingActionState["fieldErrors"]) {
  return fieldErrors?.camera ?? fieldErrors?.pickup ?? fieldErrors?.pickupDate ??
    fieldErrors?.return ?? fieldErrors?.returnDate ?? fieldErrors?.handoffTime ??
    fieldErrors?.policyVersion;
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-stone-200 py-3"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>;
}
