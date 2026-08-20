export const MANILA_TIME_ZONE = "Asia/Manila";

const WALL_CLOCK_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type BookingPeriodFieldErrors = {
  pickup?: string;
  return?: string;
};

export type QuoteInput = {
  camera: string;
  pickup: string;
  return: string;
};

export type ScheduleQuoteInput = {
  camera: string;
  handoffTime: string;
  pickupDate: string;
  policyVersion: string;
  returnDate: string;
};

export function parseManilaWallClock(value: string) {
  const match = WALL_CLOCK_PATTERN.exec(value);
  if (!match) {
    return { ok: false } as const;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const check = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return { ok: false } as const;
  }

  return {
    instant: `${value}${match[6] ? "" : ":00"}+08:00`,
    ok: true,
  } as const;
}

export function parseManilaBookingPeriod(
  pickup: string,
  returnValue: string,
  now = new Date(),
) {
  const pickupResult = parseManilaWallClock(pickup);
  const returnResult = parseManilaWallClock(returnValue);
  const fieldErrors: BookingPeriodFieldErrors = {};

  if (!pickup) {
    fieldErrors.pickup = "Enter a pickup date and time.";
  } else if (!pickupResult.ok) {
    fieldErrors.pickup = "Enter a valid pickup date and time.";
  }

  if (!returnValue) {
    fieldErrors.return = "Enter a return date and time.";
  } else if (!returnResult.ok) {
    fieldErrors.return = "Enter a valid return date and time.";
  }

  if (!pickupResult.ok || !returnResult.ok) {
    return { fieldErrors, ok: false } as const;
  }

  const pickupMs = Date.parse(pickupResult.instant);
  const returnMs = Date.parse(returnResult.instant);

  if (pickupMs <= now.getTime()) {
    fieldErrors.pickup = "Pickup must be in the future.";
  }
  if (returnMs <= pickupMs) {
    fieldErrors.return = "Return must be after pickup.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, ok: false } as const;
  }

  return {
    ok: true,
    pickupAt: pickupResult.instant,
    returnAt: returnResult.instant,
  } as const;
}

const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: MANILA_TIME_ZONE,
});

export function formatManilaDateTime(instant: string) {
  return manilaDateTimeFormatter.format(new Date(instant));
}

export function formatManilaDateTimeInput(
  instant: string,
  includeSeconds = false,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
  })
    .formatToParts(new Date(instant))
    .reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});

  const seconds = includeSeconds ? `:${parts.second}` : "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${seconds}`;
}

export function normalizeQuoteInputKey(input: QuoteInput) {
  return JSON.stringify([input.camera.trim(), input.pickup, input.return]);
}

export function normalizeScheduleQuoteInputKey(input: ScheduleQuoteInput) {
  return JSON.stringify([
    input.camera.trim(),
    input.pickupDate,
    input.returnDate,
    input.handoffTime,
    input.policyVersion,
  ]);
}
