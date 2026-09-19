"use client";

import Link from "next/link";
import { CalendarIcon, ChevronDownIcon, Cross2Icon } from "@radix-ui/react-icons";
import { phpFormatter } from "@/features/bookings/currency";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";

import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";
import { quoteBooking } from "../actions/quote-booking";
import {
  buildCalendarMonth,
  calendarDateStatus,
  calendarEndpointRole,
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
import { nextQuoteEditGeneration, scheduleQuoteFormPresentation } from "../presenter";
import { canScheduleRental } from "../scheduling";
import type { ScheduleSelection } from "../schedule-navigation";

const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: "UTC", year: "numeric" });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ScheduleQuoteFormProps = {
  compact?: boolean;
  availability: CalendarAvailability[];
  cameraId: string;
  cameraName: string;
  policy: PublicHandoffPolicy | null;
  requestable?: boolean;
  initialSchedule?: ScheduleSelection;
};

export function ScheduleQuoteForm({ availability, cameraId, cameraName, policy, requestable = true, initialSchedule, compact = false }: ScheduleQuoteFormProps) {
  const today = getManilaToday();
  const currentMonth = monthFromCalendarDate(today)!;
  const [visibleMonth, setVisibleMonth] = useState(initialSchedule ? monthFromCalendarDate(initialSchedule.pickupDate)! : currentMonth);
  const [pickupDate, setPickupDate] = useState(initialSchedule?.pickupDate ?? "");
  const [returnDate, setReturnDate] = useState(initialSchedule?.returnDate ?? "");
  const [handoffTime, setHandoffTime] = useState(initialSchedule?.handoffTime ?? (policy?.approvedTimes.length === 1 ? policy.approvedTimes[0] : ""));
  const [editGeneration, setEditGeneration] = useState(0);
  const [state, formAction, pending] = useActionState(quoteBooking, initialQuoteActionState);
  const calendarDialog = useRef<HTMLDialogElement>(null);
  const [calendarTarget, setCalendarTarget] = useState<"pickup" | "return">("pickup");
  const formRef = useRef<HTMLFormElement>(null);
  const lastAutoQuoteKey = useRef("");
  const days = useMemo(() => buildCalendarMonth(visibleMonth), [visibleMonth]);
  // Restoring the same values after an edit still needs a fresh quote generation.
  const autoQuoteKey = `${cameraId}|${policy?.version ?? 0}|${pickupDate}|${returnDate}|${handoffTime}|${editGeneration}`;
  const validHandoffTimes = useMemo(
    () => handoffTimesForRange(policy, availability, pickupDate, returnDate),
    [availability, pickupDate, policy, returnDate],
  );

  useEffect(() => {
    if (!pickupDate || !returnDate || !handoffTime || pending || lastAutoQuoteKey.current === autoQuoteKey) return;
    lastAutoQuoteKey.current = autoQuoteKey;
    formRef.current?.requestSubmit();
  }, [autoQuoteKey, handoffTime, pending, pickupDate, returnDate]);

  if (!canScheduleRental(policy, requestable)) {
    return <section aria-labelledby="schedule-unavailable-heading" className="mt-8 border-y border-[#d8e0ea] py-10">
      <h2 className="section-heading" id="schedule-unavailable-heading">Not available to rent</h2>
      <p className="mt-2 max-w-xl text-sm text-[#58677d]">{cameraName} is not accepting requests right now.</p>
      <Link className="button-secondary mt-6" href="/">Browse cameras</Link>
    </section>;
  }

  const activePolicy = policy;
  const input = { camera: cameraId, handoffTime, pickupDate, policyVersion: String(activePolicy.version), returnDate };
  const presentation = scheduleQuoteFormPresentation(state, input, pending, editGeneration);
  const selectedPickupStatus = pickupDate ? endpointStatus({ allowedWeekdays: activePolicy.allowedWeekdays, availability, date: pickupDate, role: "pickup", time: handoffTime }) : null;
  const selectedReturnStatus = returnDate ? endpointStatus({ allowedWeekdays: activePolicy.allowedWeekdays, availability, date: returnDate, role: "return", selectedPickup: pickupDate, time: handoffTime }) : null;
  const overlap = Boolean(pickupDate && returnDate && handoffTime) && periodOverlapsAvailability(pickupDate, returnDate, handoffTime, availability);
  const complete = Boolean(pickupDate && returnDate && handoffTime && !overlap && selectedPickupStatus && !selectedPickupStatus.disabled && selectedReturnStatus && !selectedReturnStatus.disabled);
  const requestQuery = new URLSearchParams(input).toString();
  const monthDate = new Date(`${visibleMonth}-01T00:00:00Z`);

  function openCalendar(target: "pickup" | "return") {
    setCalendarTarget(target === "return" && pickupDate ? "return" : "pickup");
    const date = target === "return" ? returnDate || pickupDate : pickupDate;
    if (date) setVisibleMonth(monthFromCalendarDate(date)!);
    calendarDialog.current?.showModal();
  }
  function dateRole(date: string) {
    if (compact) return calendarTarget === "return" && pickupDate && date > pickupDate ? "return" : "pickup";
    return calendarEndpointRole({ date, pickupDate, returnDate });
  }
  function markEdited() { setEditGeneration(nextQuoteEditGeneration); }
  function chooseDate(date: string) {
    const role = dateRole(date);
    const status = calendarDateStatus({ allowedWeekdays: activePolicy.allowedWeekdays, approvedTimes: activePolicy.approvedTimes, availability, date, role, selectedPickup: pickupDate });
    if (status.disabled) return;
    if (role === "return") setReturnDate(date);
    else { setPickupDate(date); setReturnDate(""); }
    const times = role === "return" ? handoffTimesForRange(activePolicy, availability, pickupDate, date) : [];
    setHandoffTime(times.length === 1 ? times[0] : "");
    markEdited();
    if (compact) {
      if (role === "return") calendarDialog.current?.close();
      else setCalendarTarget("return");
    }
  }

  const calendar = (<fieldset className="min-w-0" aria-describedby="calendar-help overlap-error">
          <legend className="font-semibold">Choose dates</legend>
          <p className="mt-1 text-sm leading-6 text-[#58677d]" id="calendar-help">{compact ? (calendarTarget === "return" ? "Choose a later return date." : "Select pickup, then return.") : pickupDate && !returnDate ? "Now choose a later return date." : !pickupDate ? "Select pickup, then return." : "Select a new date to start over."}</p>
          <div className="mt-5 border-y border-[#d8e0ea] py-5 sm:px-2">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <button aria-label="Show previous month" className="button-secondary min-w-20 disabled:cursor-not-allowed disabled:opacity-35" disabled={visibleMonth <= currentMonth} onClick={() => { const previous = shiftCalendarMonth(visibleMonth, -1); if (previous) setVisibleMonth(previous); }} type="button">Previous</button>
              <h3 aria-live="polite" className="min-w-0 text-center text-base font-semibold sm:text-lg">{monthFormatter.format(monthDate)}</h3>
              <button aria-label="Show next month" className="button-secondary min-w-20" onClick={() => { const next = shiftCalendarMonth(visibleMonth, 1); if (next) setVisibleMonth(next); }} type="button">Next</button>
            </div>
            <div aria-hidden="true" className="mt-6 grid grid-cols-7 text-center text-xs font-semibold text-[#58677d]">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">{days.map((day) => {
              if (!day.inMonth) return <span aria-hidden="true" className="min-h-14" key={day.date} />;
              const role = dateRole(day.date);
              const status = calendarDateStatus({ allowedWeekdays: activePolicy.allowedWeekdays, approvedTimes: activePolicy.approvedTimes, availability, date: day.date, role, selectedPickup: pickupDate });
              const selectedPickup = day.date === pickupDate;
              const selectedReturn = day.date === returnDate;
              const inRange = Boolean(pickupDate && returnDate && day.date > pickupDate && day.date < returnDate);
              const stateLabel = selectedPickup ? "selected pickup" : selectedReturn ? "selected return" : inRange && status.reason === "no_handoff" ? "included rental day, no lender handoff" : inRange ? "included rental day" : status.reason === "no_handoff" ? "no lender handoff" : status.reason === "unavailable" ? "unavailable" : status.reason === "closed" || status.reason === "before_pickup" ? "not selectable" : "available";
              return <button aria-label={`${day.label}, ${stateLabel}`} aria-pressed={selectedPickup || selectedReturn} className={`flex min-h-14 flex-col items-center justify-center rounded-lg px-1 text-sm font-semibold ${selectedPickup ? "bg-[#0b4f9c] text-white" : selectedReturn ? "bg-[#c9dcfb] text-[#081d3b]" : inRange ? "bg-[#e7f0ff] text-[#081d3b]" : status.reason === "no_handoff" ? "bg-[#fff7e6] text-[#58677d]" : "hover:bg-[#f2f7ff]"} disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#a0abba]`} disabled={status.disabled} key={day.date} onClick={() => chooseDate(day.date)} type="button">
                <span>{day.day}</span>{selectedPickup ? <span className="hidden text-[10px] font-medium sm:block">Pickup</span> : selectedReturn ? <span className="hidden text-[10px] font-medium sm:block">Return</span> : status.reason === "no_handoff" ? <span className="hidden text-[10px] font-normal sm:block">No handoff</span> : null}
              </button>;
            })}</div>
          </div>
        </fieldset>);

  return <section className={compact ? "compact-schedule" : "py-9 sm:py-12"} aria-labelledby="schedule-heading">
    <h2 className={compact ? "text-2xl font-semibold tracking-tight" : "page-title"} id="schedule-heading">{compact ? "Plan your rental" : "Choose your dates"}</h2>
    {compact ? <p className="mt-2 text-sm leading-6 text-[#58677d]">Choose your pickup and return dates, then select a handoff time.</p> : null}
    <span className="sr-only">Choose your schedule.</span>

    <div className={compact ? "mt-7" : "mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-12"}>
      <form className="min-w-0" onSubmit={(event) => {
        event.preventDefault();
        // A quote is a read operation: preserve the schedule instead of resetting it.
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }} ref={formRef}>
        <input name="camera" type="hidden" value={cameraId} />
        <input name="generation" type="hidden" value={editGeneration} />
        <input name="pickupDate" type="hidden" value={pickupDate} />
        <input name="policyVersion" type="hidden" value={activePolicy.version} />
        <input name="returnDate" type="hidden" value={returnDate} />

        {compact ? <>
          <div className="rental-date-fields">
            {(["pickup", "return"] as const).map((target) => <div key={target}>
              <span id={`${target}-date-label`} className="block text-sm font-semibold">{target === "pickup" ? "Pickup date" : "Return date"}</span>
              <button className="rental-date-trigger" aria-labelledby={`${target}-date-label ${target}-date-value`} aria-haspopup="dialog" type="button" onClick={() => openCalendar(target)}>
                <CalendarIcon aria-hidden="true" width={19} height={19} />
                <span id={`${target}-date-value`}>{formatDateField(target === "pickup" ? pickupDate : returnDate)}</span>
                <ChevronDownIcon aria-hidden="true" />
              </button>
            </div>)}
          </div>
          <dialog className="rental-calendar-dialog" ref={calendarDialog} aria-label="Choose rental dates" onClick={(event) => { if (event.target === event.currentTarget) calendarDialog.current?.close(); }}>
            <div className="rental-calendar-content">
              <button className="dialog-close" type="button" aria-label="Close calendar" onClick={() => calendarDialog.current?.close()}><Cross2Icon width={20} height={20} /></button>
              {calendar}
              <p className="mt-4 text-sm text-[#58677d]" aria-live="polite">Pickup: {formatDateField(pickupDate)} · Return: {formatDateField(returnDate)}</p>
            </div>
          </dialog>
        </> : calendar}

        <div className="mt-7 max-w-xl">
          <label className="block font-semibold" htmlFor="handoff-time">Handoff time</label>
          <select aria-describedby="handoff-time-help" className="mt-3 min-h-12 w-full rounded-lg border border-[#b9c6d6] bg-white px-4 text-base outline-none focus:border-[#0b4f9c] disabled:bg-[#f2f4f7]" disabled={!pickupDate || !returnDate || validHandoffTimes.length === 0} id="handoff-time" name="handoffTime" onChange={(event) => { setHandoffTime(event.target.value); markEdited(); }} required value={handoffTime}>
            <option value="">{pickupDate && returnDate ? "Choose a time" : "Choose dates first"}</option>
            {validHandoffTimes.map((time) => <option key={time} value={time}>{formatHandoffTime(time)}</option>)}
          </select>
          <p className="mt-2 text-xs leading-5 text-[#58677d]" id="handoff-time-help">Applies to pickup and return.</p>
        </div>
        <details className={`${compact ? "hidden" : ""} mt-5 text-xs leading-5 text-[#58677d]`}><summary className="cursor-pointer font-semibold text-[#0b4f9c]">Calendar key</summary><p className="mt-2">Blue marks your rental. Amber days can be included but not used for handoff. Dimmed dates cannot be selected.</p></details>
        {overlap ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" id="overlap-error" role="alert">This range overlaps a currently unavailable period. Choose another range.</p> : null}
        <button aria-hidden="true" className="sr-only" tabIndex={-1} disabled={!complete || presentation.disableQuoteSubmit} type="submit">Calculate estimate</button>
      </form>

      <aside className={compact ? "compact-estimate" : "border-t border-[#d8e0ea] pt-8 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0"} aria-labelledby="schedule-summary-heading">
        <h3 className={compact ? "sr-only" : "section-heading"} id="schedule-summary-heading">Your schedule</h3>
        <dl className={compact ? "sr-only" : "mt-5"}>
          <QuoteValue label="Pickup" value={presentation.quote ? formatManilaDateTime(presentation.quote.pickupAt) : pickupDate || "Choose a date"} />
          <QuoteValue label="Return" value={presentation.quote ? formatManilaDateTime(presentation.quote.returnAt) : returnDate || "Choose a date"} />
          <QuoteValue label="Handoff time" value={handoffTime ? `${formatHandoffTime(handoffTime)} PHT` : "Choose a time"} />
          <QuoteValue label="Meetup area" value={`${activePolicy.cityLabel} (${activePolicy.approximationLevel === "barangay_centroid" ? "barangay-level approximation" : activePolicy.approximationLevel === "precise" ? "precise origin kept private" : "city-level approximation"})`} />
        </dl>
        {presentation.liveMessage ? <p aria-live="polite" className={`mt-5 rounded-lg px-4 py-3 text-sm ${state.error ? "border border-red-200 bg-red-50 text-red-800" : "bg-[#f2f7ff] text-[#082d5d]"}`} role={state.error ? "alert" : "status"}>{presentation.liveMessage}</p> : null}
        {state.error === "retryable" ? <button className="button-secondary mt-4" disabled={!complete || pending} onClick={() => formRef.current?.requestSubmit()} type="button">{pending ? "Retrying estimate…" : "Retry estimate"}</button> : null}
        {presentation.quote ? <section aria-labelledby="schedule-quote-heading" className="mt-7 border-t border-[#d8e0ea] pt-6">
          <h4 className="text-lg font-semibold" id="schedule-quote-heading">Estimate</h4>
          <dl className="mt-3"><QuoteValue label="Billable days" value={`${presentation.quote.billableDays} ${presentation.quote.billableDays === 1 ? "day" : "days"}`} /><QuoteValue label="Rental subtotal" value={phpFormatter.format(presentation.quote.rentalAmount)} /><QuoteValue label="Security deposit" value={phpFormatter.format(presentation.quote.securityDeposit)} /><QuoteValue label="Estimated total" value={phpFormatter.format(presentation.quote.totalDue)} strong /></dl>
          <p className="mt-4 text-xs text-[#754000]">Estimate only—not reserved.</p>
          {presentation.canContinue ? <Link className="button-primary mt-5 w-full" href={`/checkout?${requestQuery}`}>Continue to checkout</Link> : null}
        </section> : <p className="mt-7 border-t border-[#d8e0ea] pt-6 text-sm text-[#58677d]">{compact ? "Choose dates and a time to see your estimate." : "Your estimate appears after you choose dates and a time. It does not reserve the camera."}</p>}
        {compact && !presentation.canContinue ? <button className="button-primary mt-6 w-full" type="button" disabled>Continue to checkout</button> : null}
      </aside>
    </div>
  </section>;
}

function handoffTimesForRange(policy: PublicHandoffPolicy | null, availability: CalendarAvailability[], pickupDate: string, returnDate: string) {
  if (!policy || !pickupDate || !returnDate) return [];
  return policy.approvedTimes.filter((time) => {
    const pickup = endpointStatus({ allowedWeekdays: policy.allowedWeekdays, availability, date: pickupDate, role: "pickup", time });
    const returning = endpointStatus({ allowedWeekdays: policy.allowedWeekdays, availability, date: returnDate, role: "return", selectedPickup: pickupDate, time });
    return !pickup.disabled && !returning.disabled && !periodOverlapsAvailability(pickupDate, returnDate, time, availability);
  });
}

function QuoteValue({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return <div className="detail-row"><dt className="text-sm text-[#58677d]">{label}</dt><dd className={`${strong ? "text-lg" : "text-sm"} max-w-[60%] text-right font-semibold text-[#081d3b]`}>{value}</dd></div>;
}

function formatDateField(date: string) {
  return date ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "Choose date";
}
