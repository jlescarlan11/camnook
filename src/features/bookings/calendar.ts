import { parseManilaWallClock } from "./manila-time";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export type CalendarAvailability = { endsAt: string; startsAt: string };

export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  label: string;
  weekday: number;
};

function validDateParts(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { date, day, month, year };
}

export function isCalendarDate(value: string) {
  return Boolean(validDateParts(value));
}

export function isHandoffTime(value: string) {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function composeManilaWallClock(date: string, time: string) {
  if (!isCalendarDate(date) || !isHandoffTime(time)) return null;
  const parsed = parseManilaWallClock(`${date}T${time}`);
  return parsed.ok ? parsed.instant : null;
}

export function getManilaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function monthFromCalendarDate(date: string) {
  return isCalendarDate(date) ? date.slice(0, 7) : null;
}

export function shiftCalendarMonth(month: string, delta: number) {
  const match = MONTH_PATTERN.exec(month);
  if (!match || !Number.isInteger(delta)) return null;
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const value = new Date(Date.UTC(Number(match[1]), monthNumber - 1 + delta, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildCalendarMonth(month: string): CalendarDay[] {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return [];
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const labelFormatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeZone: "UTC",
  });

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    const date = value.toISOString().slice(0, 10);
    return {
      date,
      day: value.getUTCDate(),
      inMonth: value.getUTCMonth() === monthIndex,
      label: labelFormatter.format(value),
      weekday: value.getUTCDay(),
    };
  });
}

export function endpointStatus(input: {
  allowedWeekdays: readonly number[];
  availability: CalendarAvailability[];
  date: string;
  now?: Date;
  role: "pickup" | "return";
  selectedPickup?: string;
  time: string;
}) {
  const parts = validDateParts(input.date);
  const instant = composeManilaWallClock(input.date, input.time);
  if (!parts || !instant) return { disabled: true, reason: "invalid" as const };
  if (!input.allowedWeekdays.includes(parts.date.getUTCDay())) {
    return { disabled: true, reason: "no_handoff" as const };
  }
  if (Date.parse(instant) <= (input.now ?? new Date()).getTime()) {
    return { disabled: true, reason: "closed" as const };
  }
  if (
    input.role === "return" &&
    input.selectedPickup &&
    input.date <= input.selectedPickup
  ) {
    return { disabled: true, reason: "before_pickup" as const };
  }
  const point = Date.parse(instant);
  const unavailable = input.availability.some((period) => {
    const startsAt = Date.parse(period.startsAt);
    const endsAt = Date.parse(period.endsAt);

    return input.role === "pickup"
      ? point >= startsAt && point < endsAt
      : point > startsAt && point <= endsAt;
  });
  return unavailable
    ? { disabled: true, reason: "unavailable" as const }
    : { disabled: false, reason: "available" as const };
}

export function periodOverlapsAvailability(
  pickupDate: string,
  returnDate: string,
  time: string,
  availability: CalendarAvailability[],
) {
  const pickup = composeManilaWallClock(pickupDate, time);
  const returnValue = composeManilaWallClock(returnDate, time);
  if (!pickup || !returnValue || Date.parse(pickup) >= Date.parse(returnValue)) {
    return true;
  }
  const pickupMs = Date.parse(pickup);
  const returnMs = Date.parse(returnValue);
  return availability.some(
    (period) =>
      pickupMs < Date.parse(period.endsAt) &&
      returnMs > Date.parse(period.startsAt),
  );
}

export function formatHandoffTime(time: string) {
  if (!isHandoffTime(time)) return time;
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}
