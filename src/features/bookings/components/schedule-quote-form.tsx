"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";

import { quoteBooking } from "../actions/quote-booking";
import {
  buildCalendarMonth,
  endpointStatus,
  formatHandoffTime,
  getManilaToday,
  monthFromCalendarDate,
  periodOverlapsAvailability,
  shiftCalendarMonth,
  type CalendarAvailability,
} from "../calendar";
import { initialQuoteActionState } from "../form-state";
import { formatManilaDateTime } from "../manila-time";
import {
  nextQuoteEditGeneration,
  scheduleQuoteFormPresentation,
} from "../presenter";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ScheduleQuoteFormProps = {
  availability: CalendarAvailability[];
  cameraId: string;
  cameraName: string;
  policy: PublicHandoffPolicy | null;
};

export function ScheduleQuoteForm({
  availability,
  cameraId,
  cameraName,
  policy,
}: ScheduleQuoteFormProps) {
  const today = getManilaToday();
  const currentMonth = monthFromCalendarDate(today)!;
  const [visibleMonth, setVisibleMonth] = useState(currentMonth);
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [handoffTime, setHandoffTime] = useState("");
  const [editGeneration, setEditGeneration] = useState(0);
  const [state, formAction, pending] = useActionState(
    quoteBooking,
    initialQuoteActionState,
  );
  const days = useMemo(() => buildCalendarMonth(visibleMonth), [visibleMonth]);

  if (
    !policy?.enabled ||
    policy.allowedWeekdays.length === 0 ||
    policy.approvedTimes.length === 0
  ) {
    return (
      <section
        aria-labelledby="schedule-unavailable-heading"
        className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h2 className="text-2xl font-semibold" id="schedule-unavailable-heading">
          Scheduling unavailable
        </h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {cameraName} does not have an active lender handoff schedule. Check
          back later or choose another published camera.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center font-semibold text-amber-900 underline"
          href="/"
        >
          Browse cameras
        </Link>
      </section>
    );
  }
  const activePolicy = policy;

  const input = {
    camera: cameraId,
    handoffTime,
    pickupDate,
    policyVersion: String(activePolicy.version),
    returnDate,
  };
  const presentation = scheduleQuoteFormPresentation(
    state,
    input,
    pending,
    editGeneration,
  );
  const selectedPickupStatus = pickupDate
    ? endpointStatus({
        allowedWeekdays: activePolicy.allowedWeekdays,
        availability,
        date: pickupDate,
        role: "pickup",
        time: handoffTime,
      })
    : null;
  const selectedReturnStatus = returnDate
    ? endpointStatus({
        allowedWeekdays: activePolicy.allowedWeekdays,
        availability,
        date: returnDate,
        role: "return",
        selectedPickup: pickupDate,
        time: handoffTime,
      })
    : null;
  const overlap =
    Boolean(pickupDate && returnDate && handoffTime) &&
    periodOverlapsAvailability(
      pickupDate,
      returnDate,
      handoffTime,
      availability,
    );
  const complete = Boolean(
    pickupDate &&
      returnDate &&
      handoffTime &&
      !overlap &&
      selectedPickupStatus &&
      !selectedPickupStatus.disabled &&
      selectedReturnStatus &&
      !selectedReturnStatus.disabled,
  );
  const requestQuery = new URLSearchParams(input).toString();
  const monthDate = new Date(`${visibleMonth}-01T00:00:00Z`);

  function markEdited() {
    setEditGeneration(nextQuoteEditGeneration);
  }

  function chooseDate(date: string) {
    if (!handoffTime) return;
    const choosingReturn = Boolean(pickupDate && !returnDate);
    const status = endpointStatus({
      allowedWeekdays: activePolicy.allowedWeekdays,
      availability,
      date,
      role: choosingReturn ? "return" : "pickup",
      selectedPickup: pickupDate,
      time: handoffTime,
    });
    if (status.disabled) return;

    if (choosingReturn && date > pickupDate) {
      setReturnDate(date);
    } else {
      setPickupDate(date);
      setReturnDate("");
    }
    markEdited();
  }

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-2xl font-semibold tracking-tight">Choose rental dates</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Select one lender-approved handoff time, then pickup and return dates.
        The same Philippine time applies to both endpoints. A quote or request
        does not reserve the camera.
      </p>

      <form action={formAction} className="mt-6 space-y-6">
        <input name="camera" type="hidden" value={cameraId} />
        <input name="generation" type="hidden" value={editGeneration} />
        <input name="pickupDate" type="hidden" value={pickupDate} />
        <input name="policyVersion" type="hidden" value={activePolicy.version} />
        <input name="returnDate" type="hidden" value={returnDate} />

        <div>
          <label className="block text-sm font-medium" htmlFor="handoff-time">
            Handoff time — Asia/Manila
          </label>
          <select
            aria-describedby={
              state.fieldErrors?.handoffTime
                ? "handoff-time-error"
                : "handoff-time-help"
            }
            aria-invalid={Boolean(state.fieldErrors?.handoffTime)}
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            id="handoff-time"
            name="handoffTime"
            onChange={(event) => {
              setHandoffTime(event.target.value);
              markEdited();
            }}
            required
            value={handoffTime}
          >
            <option value="">Choose an approved time</option>
            {activePolicy.approvedTimes.map((time) => (
              <option key={time} value={time}>
                {formatHandoffTime(time)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs leading-5 text-stone-500" id="handoff-time-help">
            Times never shift with your device timezone.
          </p>
          {state.fieldErrors?.handoffTime ? (
            <p className="mt-2 text-sm text-red-700" id="handoff-time-error" role="alert">
              {state.fieldErrors.handoffTime}
            </p>
          ) : null}
        </div>

        <fieldset aria-describedby="calendar-help overlap-error">
          <legend className="text-sm font-semibold">Rental date range</legend>
          <p className="mt-1 text-xs leading-5 text-stone-500" id="calendar-help">
            {!handoffTime
              ? "Choose a handoff time before selecting dates."
              : pickupDate && !returnDate
                ? "Pickup selected. Choose a later return date."
                : "Choose pickup, then return. Selecting again starts a new range."}
          </p>

          <div className="mt-3 rounded-2xl border border-stone-200 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                aria-label="Show previous month"
                className="min-h-11 min-w-11 rounded-lg border border-stone-300 text-xl disabled:opacity-40"
                disabled={visibleMonth <= currentMonth}
                onClick={() => {
                  const previous = shiftCalendarMonth(visibleMonth, -1);
                  if (previous) setVisibleMonth(previous);
                }}
                type="button"
              >
                ‹
              </button>
              <h3 aria-live="polite" className="font-semibold">
                {monthFormatter.format(monthDate)}
              </h3>
              <button
                aria-label="Show next month"
                className="min-h-11 min-w-11 rounded-lg border border-stone-300 text-xl"
                onClick={() => {
                  const next = shiftCalendarMonth(visibleMonth, 1);
                  if (next) setVisibleMonth(next);
                }}
                type="button"
              >
                ›
              </button>
            </div>

            <div aria-hidden="true" className="mt-4 grid grid-cols-7 text-center text-xs font-semibold text-stone-500">
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {days.map((day) => {
                if (!day.inMonth) {
                  return <span aria-hidden="true" className="min-h-11" key={day.date} />;
                }
                const choosingReturn = Boolean(pickupDate && !returnDate);
                const status = handoffTime
                  ? endpointStatus({
                      allowedWeekdays: activePolicy.allowedWeekdays,
                      availability,
                      date: day.date,
                      role: choosingReturn ? "return" : "pickup",
                      selectedPickup: pickupDate,
                      time: handoffTime,
                    })
                  : { disabled: true, reason: "choose_time" as const };
                const selectedPickup = day.date === pickupDate;
                const selectedReturn = day.date === returnDate;
                const inRange = Boolean(
                  pickupDate && returnDate && day.date > pickupDate && day.date < returnDate,
                );
                const stateLabel = selectedPickup
                  ? "selected pickup"
                  : selectedReturn
                    ? "selected return"
                    : status.reason === "no_handoff"
                      ? "no lender handoff"
                      : status.reason === "unavailable"
                      ? "unavailable"
                      : status.reason === "choose_time"
                        ? "choose a handoff time first"
                      : status.reason === "closed" || status.reason === "before_pickup"
                          ? "not selectable"
                          : "available";
                return (
                  <button
                    aria-label={`${day.label}, ${stateLabel}`}
                    aria-pressed={selectedPickup || selectedReturn}
                    className={`min-h-11 rounded-lg text-sm font-medium focus:outline-none focus:ring-4 focus:ring-amber-200 ${
                      selectedPickup || selectedReturn
                        ? "bg-stone-950 text-white"
                        : inRange
                          ? "bg-amber-100 text-stone-950"
                          : "hover:bg-stone-100"
                    } disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent`}
                    disabled={status.disabled}
                    key={day.date}
                    onClick={() => chooseDate(day.date)}
                    type="button"
                  >
                    {day.day}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        <div className="rounded-xl bg-stone-50 p-4 text-sm">
          <h3 className="font-semibold">Selected schedule</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <QuoteValue label="Pickup date" value={pickupDate || "Not selected"} />
            <QuoteValue label="Return date" value={returnDate || "Not selected"} />
            <QuoteValue
              label="Handoff time"
              value={handoffTime ? `${formatHandoffTime(handoffTime)} PHT` : "Not selected"}
            />
            <QuoteValue label="Meetup city" value={activePolicy.cityLabel} />
          </dl>
        </div>

        <div className="text-xs leading-5 text-stone-600">
          <h3 className="font-semibold text-stone-800">Availability key</h3>
          <p className="mt-1">Dark: selected · Amber: selected range · Dimmed: closed, unavailable, or no handoff endpoint.</p>
          <p>No-handoff weekdays may remain inside a valid range.</p>
        </div>

        {overlap ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" id="overlap-error" role="alert">
            This range overlaps a currently unavailable period. Choose another range.
          </p>
        ) : null}

        <button
          className="min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!complete || presentation.disableQuoteSubmit}
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
        <section aria-labelledby="schedule-quote-heading" className="mt-6 border-t border-stone-200 pt-6">
          <h3 className="text-xl font-semibold" id="schedule-quote-heading">
            Estimated rental
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            This estimate does not reserve inventory. The current handoff policy
            and availability are checked again when you submit the request.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <QuoteValue label="Pickup" value={formatManilaDateTime(presentation.quote.pickupAt)} />
            <QuoteValue label="Return" value={formatManilaDateTime(presentation.quote.returnAt)} />
            <QuoteValue label="Billable days" value={String(presentation.quote.billableDays)} />
            <QuoteValue label="Rental amount" value={phpFormatter.format(presentation.quote.rentalAmount)} />
            <QuoteValue label="Security deposit" value={phpFormatter.format(presentation.quote.securityDeposit)} />
            <QuoteValue label="Total due" value={phpFormatter.format(presentation.quote.totalDue)} />
          </dl>
          {presentation.canContinue ? (
            <Link
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-500 px-5 py-3 font-semibold text-stone-950 transition hover:bg-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-200"
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
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold text-stone-950">{value}</dd>
    </div>
  );
}
