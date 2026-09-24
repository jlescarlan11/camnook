"use client";

import { meetupMapUrl, type MeetupPlace } from "@/features/meetups/places";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckoutProgress } from "./checkout-progress";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";

import { requestBooking, type RequestBookingActionState } from "@/features/bookings/actions/request-booking";
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

export function RequestForm({
  camera,
  meetupPlaces = [],
  checkoutHref,
  profile,
  returnHref,
  schedule,
  summary,
}: {
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
}) {
  const router = useRouter();
  const [placeChoice, setPlaceChoice] = useState("");
  const selectedPlace = meetupPlaces?.find(p => `${p.id}:${p.version}` === placeChoice);
  const [reviewing, setReviewing] = useState(false);
  const [state, formAction, pending] = useActionState(async (previous: RequestBookingActionState, data: FormData) => {
    const result = await requestBooking(previous, data);
    if (result.error === "meetup_changed") { setPlaceChoice(""); setReviewing(false); router.refresh(); }
    if (result.fieldErrors && (
      result.fieldErrors.legalName || result.fieldErrors.phone ||
      result.fieldErrors.meetupPlace || result.fieldErrors.intendedUse ||
      result.fieldErrors.expectedLocation
    )) setReviewing(false);
    return result;
  }, initialRequestBookingActionState);
  const [operationId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState({
    expectedLocation: state.values?.expectedLocation ?? "",
    intendedUse: state.values?.intendedUse ?? "",
    legalName: state.values?.legalName ?? profile?.legalName ?? "",
    phone: mobileInputDigits(state.values?.phone ?? profile?.phone ?? ""),
  });
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

  return (
    <form action={formAction} className={checkoutHref ? "checkout-request" : "space-y-6"} onSubmit={(event) => {
      if (!reviewing) {
        event.preventDefault();
        if (selectedPlace && formRef.current?.reportValidity()) setReviewing(true);
      }
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
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={state.fieldErrors?.legalName}>
              <input autoComplete="name" className={inputClass} maxLength={160} name="legalName" onChange={(event) => update("legalName", event.target.value)} required value={values.legalName} />
            </Field>
            <Field label="Phone" error={state.fieldErrors?.phone}>
              <PhilippineMobileInput aria-label="Phone" name="phone" onChange={(digits) => update("phone", digits)} required value={values.phone} />
            </Field>
          </div>
          <div className="mt-5 space-y-5">
            <fieldset className="space-y-3">
              <legend className="mb-3 font-semibold">Choose your meetup place</legend>
              <p className="text-sm text-stone-500">Pickup and return use the same place, subject to owner approval.</p>
              {meetupPlaces === null ? <p role="alert">Meetup places could not be loaded. <button className="underline" type="button" onClick={() => router.refresh()}>Try again</button></p> : !meetupPlaces.length ? <p role="status">This camera has no meetup places available. New rental requests are unavailable.</p> : meetupPlaces.map(place => <div className="rounded-lg border border-stone-200 p-4 has-[:checked]:border-[#0b4f9c]" key={`${place.id}:${place.version}`}>
                <label className="flex cursor-pointer gap-3"><input required name="meetupChoice" type="radio" value={`${place.id}:${place.version}`} checked={selectedPlace?.id === place.id} onChange={event => setPlaceChoice(event.target.value)} /><span><strong>{place.name}</strong><span className="mt-1 block text-sm">{place.address}</span>{place.arrival_instructions ? <span className="mt-2 block text-sm text-stone-600">{place.arrival_instructions}</span> : null}</span></label>
                <a className="mt-2 inline-flex min-h-11 items-center text-sm underline" href={meetupMapUrl(place.latitude,place.longitude)} target="_blank" rel="noreferrer">View on map</a>
                {place.attribution ? <p className="text-xs text-stone-500">{place.attribution}</p> : null}
              </div>)}
              {state.fieldErrors?.meetupPlace || state.error === "meetup_changed" ? <p role="alert" className="text-sm text-red-800">{state.fieldErrors?.meetupPlace ?? "Meetup choices changed. Choose a current place before continuing."}</p> : null}
            </fieldset>
            <Field label="Purpose" error={state.fieldErrors?.intendedUse}>
              <textarea className={`${inputClass} min-h-28`} maxLength={1000} name="intendedUse" onChange={(event) => update("intendedUse", event.target.value)} placeholder="Tell the owner what you plan to shoot" required value={values.intendedUse} />
            </Field>
            <Field label="Shooting city" error={state.fieldErrors?.expectedLocation}>
              <input autoComplete="address-level2" className={inputClass} maxLength={500} name="expectedLocation" onChange={(event) => update("expectedLocation", event.target.value)} placeholder="e.g. Cebu City" required value={values.expectedLocation} />
            </Field>
          </div>
          <button disabled={!meetupPlaces?.length} className="button-primary mt-7 w-full disabled:opacity-60" onClick={() => {
            if (selectedPlace && formRef.current?.reportValidity()) setReviewing(true);
          }} type="button">Review rental request</button>
        </section>
        <section aria-labelledby="review-heading" hidden={!reviewing}>
          <h2 className="mt-2 text-2xl font-semibold" id="review-heading" ref={reviewHeadingRef} tabIndex={-1}>Review</h2>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
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
          <button className="mt-6 min-h-11 font-semibold text-amber-900 underline" onClick={() => setReviewing(false)} type="button">Edit your details</button>
          {state.error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800" role="alert">
              {state.error === "suspended" ? "This account cannot submit requests. Contact CamNook for help." : state.error === "kyc_required" ? <>Your KYC details need attention. <Link className="font-semibold underline" href="/account#default-address">Review your KYC profile</Link>.</> : state.error === "request_limit" ? "You already have 10 requests awaiting review." : state.error === "schedule_changed" || state.error === "unavailable" ? <>That schedule is no longer available. <Link className="font-semibold underline" href={returnHref ?? "/"}>Choose another schedule</Link>.</> : state.error === "profile_required" ? "We couldn’t save your contact details. Check them and retry." : state.error === "request_failed" ? <>We couldn’t confirm the request. <Link className="font-semibold underline" href="/account">Check your bookings</Link> before retrying.</> : "Check your details and try again."}
            </div>
          ) : null}
          <p className="mt-5 text-sm text-[#754000]">Estimate only—not reserved. Submitting sends a rental request for owner review; no payment is taken here.</p>
          <button className="button-primary mt-6 w-full disabled:opacity-60" disabled={pending || !selectedPlace} type="submit">
            {pending ? "Requesting rental…" : "Submit rental request"}
          </button>
        </section>
    </form>
  );
}

const inputClass = "mt-2 w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-[#0b4f9c] focus:ring-4 focus:ring-[#c9dcfb]";

function Field({ children, error, help, label }: { children: ReactNode; error?: string; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal leading-5 text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" role="alert">{error}</span> : null}</label>;
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-stone-200 py-3"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>;
}
