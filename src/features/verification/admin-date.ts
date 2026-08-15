const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Manila",
  year: "numeric",
});

export function isIsoCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function manilaBusinessDate(now = new Date()) {
  const parts = Object.fromEntries(
    MANILA_DATE_FORMATTER.formatToParts(now).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextManilaBusinessDate(now = new Date()) {
  const [year, month, day] = manilaBusinessDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}
