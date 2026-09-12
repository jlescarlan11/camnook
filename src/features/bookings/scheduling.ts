import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";

export function canScheduleRental(
  policy: PublicHandoffPolicy | null,
  requestable: boolean,
): policy is PublicHandoffPolicy {
  return Boolean(requestable && policy?.enabled && policy.allowedWeekdays.length && policy.approvedTimes.length);
}
