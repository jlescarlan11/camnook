import { z } from "zod";

import type { PortfolioPeriod } from "./data";

type SearchParams = Record<string, string | string[] | undefined>;

const isoDateSchema = z.iso.date().refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function manilaDateParts(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function defaultPortfolioPeriod(now = new Date()): PortfolioPeriod {
  const parts = manilaDateParts(now);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    endDateExclusive: addDays(today, 1),
    startDate: `${parts.year}-${parts.month}-01`,
  };
}

export function resolvePortfolioPeriod(
  searchParams: SearchParams,
  now = new Date(),
) {
  const defaults = defaultPortfolioPeriod(now);
  const rawStart = first(searchParams.start);
  const rawEnd = first(searchParams.end);

  if (rawStart === undefined && rawEnd === undefined) {
    return { period: defaults, status: "valid" } as const;
  }

  const start = isoDateSchema.safeParse(rawStart);
  const end = isoDateSchema.safeParse(rawEnd);
  if (!start.success || !end.success || end.data <= start.data) {
    return { period: defaults, status: "invalid" } as const;
  }

  return {
    period: { endDateExclusive: end.data, startDate: start.data },
    status: "valid",
  } as const;
}
