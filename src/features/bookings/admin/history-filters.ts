import { z } from "zod";
import { bookingStates, type BookingState } from "@/domain/bookings/state-machine";

export const BOOKING_HISTORY_PAGE_SIZE = 20;

const filterSchema = z.object({
  renter: z.string().trim().max(120).default(""),
  state: z.union([z.enum(bookingStates), z.literal("")]).default(""),
  page: z.string().regex(/^[1-9]\d*$/).default("1").transform(Number)
    .pipe(z.number().int().max(Math.floor(Number.MAX_SAFE_INTEGER / BOOKING_HISTORY_PAGE_SIZE))),
});

export type BookingHistoryFilters = z.output<typeof filterSchema>;

export function parseBookingHistoryFilters(params: Record<string, string | string[] | undefined>) {
  return filterSchema.safeParse(params);
}

export function bookingHistoryHref(filters: BookingHistoryFilters) {
  const query = new URLSearchParams();
  if (filters.renter) query.set("renter", filters.renter);
  if (filters.state) query.set("state", filters.state);
  if (filters.page > 1) query.set("page", String(filters.page));
  return `/admin/bookings/history${query.size ? `?${query}` : ""}`;
}

export const bookingHistoryStateLabels: Record<BookingState, string> = {
  FOR_REVIEW: "Awaiting review",
  CONTRACT_PENDING: "Agreement pending",
  TO_PAY: "Awaiting payment",
  PAYMENT_REVIEW: "Payment review",
  CONFIRMED: "Confirmed",
  ACTIVE: "Active rental",
  RETURN_REVIEW: "Return review",
  ISSUE_REVIEW: "Issue review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};
