"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { quoteBooking } from "@/features/bookings/actions/quote-booking";
import { initialQuoteActionState } from "@/features/bookings/form-state";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import {
  nextQuoteEditGeneration,
  quoteFormPresentation,
} from "@/features/bookings/presenter";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export function QuoteForm({ cameraId, cameraName }: { cameraId: string; cameraName: string }) {
  const [camera, setCamera] = useState(cameraId);
  const [pickup, setPickup] = useState("");
  const [returnValue, setReturnValue] = useState("");
  const [editGeneration, setEditGeneration] = useState(0);
  const [state, formAction, pending] = useActionState(
    quoteBooking,
    initialQuoteActionState,
  );
  const presentation = quoteFormPresentation(
    { ...state },
    { camera, pickup, return: returnValue },
    pending,
    editGeneration,
  );
  const requestQuery = new URLSearchParams({
    camera,
    pickup,
    return: returnValue,
  }).toString();

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Get an estimate</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Enter pickup and return in Philippine time (Asia/Manila, UTC+08:00).
        Every started 24-hour period is billed as returned by CamNook’s
        authoritative pricing service.
      </p>

      <form action={formAction} className="mt-6 space-y-5">
        <input name="generation" type="hidden" value={editGeneration} />
        <div>
          <label className="block text-sm font-medium" htmlFor="camera">
            Camera
          </label>
          <select
            aria-describedby={state.fieldErrors?.camera ? "camera-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.camera)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            id="camera"
            name="camera"
            onChange={(event) => {
              setCamera(event.target.value);
              setEditGeneration(nextQuoteEditGeneration);
            }}
            value={camera}
          >
            <option value={cameraId}>{cameraName}</option>
          </select>
          {state.fieldErrors?.camera ? (
            <p className="mt-2 text-sm text-red-700" id="camera-error" role="alert">
              {state.fieldErrors.camera}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium" htmlFor="pickup">
              Pickup — Philippine time
            </label>
            <input
              aria-describedby={state.fieldErrors?.pickup ? "pickup-error" : "time-help"}
              aria-invalid={Boolean(state.fieldErrors?.pickup)}
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
              id="pickup"
              name="pickup"
              onChange={(event) => {
                setPickup(event.target.value);
                setEditGeneration(nextQuoteEditGeneration);
              }}
              required
              step="60"
              type="datetime-local"
              value={pickup}
            />
            {state.fieldErrors?.pickup ? (
              <p className="mt-2 text-sm text-red-700" id="pickup-error" role="alert">
                {state.fieldErrors.pickup}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="return">
              Return — Philippine time
            </label>
            <input
              aria-describedby={state.fieldErrors?.return ? "return-error" : "time-help"}
              aria-invalid={Boolean(state.fieldErrors?.return)}
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
              id="return"
              name="return"
              onChange={(event) => {
                setReturnValue(event.target.value);
                setEditGeneration(nextQuoteEditGeneration);
              }}
              required
              step="60"
              type="datetime-local"
              value={returnValue}
            />
            {state.fieldErrors?.return ? (
              <p className="mt-2 text-sm text-red-700" id="return-error" role="alert">
                {state.fieldErrors.return}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-xs leading-5 text-stone-500" id="time-help">
          Times are interpreted as Manila wall-clock values even when your
          device is in another timezone.
        </p>

        <button
          className="min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={presentation.disableQuoteSubmit}
          type="submit"
        >
          {pending ? "Getting quote…" : "Get authoritative quote"}
        </button>
      </form>

      {presentation.liveMessage ? (
        <p
          aria-live="polite"
          className={`mt-5 rounded-xl px-4 py-3 text-sm ${state.error ? "border border-red-200 bg-red-50 text-red-800" : "border border-amber-200 bg-amber-50 text-amber-950"}`}
          role={state.error ? "alert" : "status"}
        >
          {presentation.liveMessage}
        </p>
      ) : null}

      {presentation.quote ? (
        <section aria-labelledby="quote-heading" className="mt-6 border-t border-stone-200 pt-6">
          <h3 className="text-xl font-semibold" id="quote-heading">
            Estimated rental
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This estimate is current for these inputs until approval. It does
            not reserve the camera; approval is subject to verification and
            availability.
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <QuoteValue label="Pickup" value={formatManilaDateTime(presentation.quote.pickupAt)} />
            <QuoteValue label="Return" value={formatManilaDateTime(presentation.quote.returnAt)} />
            <QuoteValue label="Billable days" value={String(presentation.quote.billableDays)} />
            <QuoteValue label="Daily rate" value={phpFormatter.format(presentation.quote.dailyRate)} />
            <QuoteValue label="Rental amount" value={phpFormatter.format(presentation.quote.rentalAmount)} />
            <QuoteValue label="Security deposit" value={phpFormatter.format(presentation.quote.securityDeposit)} />
            <QuoteValue label="Total due" value={phpFormatter.format(presentation.quote.totalDue)} />
            <QuoteValue label="Currency" value={presentation.quote.currency} />
          </dl>
          {presentation.canContinue ? (
            <Link
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-500 px-5 py-3 font-semibold text-stone-950 transition hover:bg-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-200 sm:w-auto"
              href={`/account/bookings/new?${requestQuery}`}
            >
              Continue to request
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function QuoteValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold text-stone-950">{value}</dd>
    </div>
  );
}
