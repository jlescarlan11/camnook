import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";
import { endpointStatus, isCalendarDate, isHandoffTime, periodOverlapsAvailability, type CalendarAvailability } from "./calendar";

export type ScheduleSelection = { pickupDate: string; returnDate: string; handoffTime: string };

export function scheduleEditHref(slug: string, selection: ScheduleSelection) {
  return `/cameras/${encodeURIComponent(slug)}?${new URLSearchParams({ pickupDate: selection.pickupDate, returnDate: selection.returnDate, handoffTime: selection.handoffTime })}`;
}

export function restoreScheduleSelection(
  params: Record<string, string | string[] | undefined>,
  policy: PublicHandoffPolicy | null,
  availability: CalendarAvailability[],
  now = new Date(),
): ScheduleSelection | undefined {
  const { pickupDate, returnDate, handoffTime } = params;
  if (!policy?.enabled || typeof pickupDate !== "string" || typeof returnDate !== "string" || typeof handoffTime !== "string") return;
  if (!isCalendarDate(pickupDate) || !isCalendarDate(returnDate) || !isHandoffTime(handoffTime) || !policy.approvedTimes.includes(handoffTime)) return;
  const common = { allowedWeekdays: policy.allowedWeekdays, availability, now, time: handoffTime };
  if (endpointStatus({ ...common, date: pickupDate, role: "pickup" }).disabled || endpointStatus({ ...common, date: returnDate, role: "return", selectedPickup: pickupDate }).disabled || periodOverlapsAvailability(pickupDate, returnDate, handoffTime, availability)) return;
  return { pickupDate, returnDate, handoffTime };
}
