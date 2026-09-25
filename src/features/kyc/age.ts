import { MANILA_TIME_ZONE } from "@/features/bookings/manila-time";

const manilaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Match PostgreSQL's date minus a year interval: subtract calendar years in
// Manila and clamp February 29 to February 28 when the target year is not leap.
export function kycDateYearsAgo(years: number, now = new Date()) {
  const parts = manilaDate.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)!.value);
  const year = part("year") - years;
  const month = part("month");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(part("day"), lastDay);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
