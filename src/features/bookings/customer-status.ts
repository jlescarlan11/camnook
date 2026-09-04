import type { BookingState } from "@/domain/bookings/state-machine";
import { formatManilaDateTime } from "./manila-time";

export const OWNER_REVIEW_TARGET_MS = 12 * 60 * 60 * 1_000;

const statusCopy: Record<BookingState, { label: string; nextStep: string }> = {
  FOR_REVIEW: { label: "Awaiting owner review", nextStep: "The owner aims to review requests within 12 hours; approval and availability are not guaranteed." },
  CONTRACT_PENDING: { label: "Agreement ready for review", nextStep: "Review and sign the current rental agreement before its displayed deadline." },
  TO_PAY: { label: "Payment needed", nextStep: "Send the exact amount to the displayed recipient before the payment deadline." },
  PAYMENT_REVIEW: { label: "Payment under review", nextStep: "Wait for the owner to verify the submitted payment proof." },
  CONFIRMED: { label: "Booking confirmed", nextStep: "Follow the pickup instructions and bring your original government ID." },
  ACTIVE: { label: "Rental in progress", nextStep: "Return the camera and inclusions at the confirmed time and meetup." },
  RETURN_REVIEW: { label: "Return being checked", nextStep: "Wait while the returned equipment and condition record are reviewed." },
  ISSUE_REVIEW: { label: "Return issue under review", nextStep: "Review the documented issue and wait for the owner’s resolution." },
  COMPLETED: { label: "Rental completed", nextStep: "No action is needed; keep this booking for your records." },
  REJECTED: { label: "Request not approved", nextStep: "Browse other cameras or choose a different rental schedule." },
  EXPIRED: { label: "Booking expired", nextStep: "Start a new request if you still need the camera." },
  CANCELLED: { label: "Booking cancelled", nextStep: "No action is needed; start a new request when ready." },
};

export function presentCustomerBookingStatus(
  state: string,
  requestedAt?: string,
): { label: string; nextStep: string; target?: string } {
  const copy = statusCopy[state as BookingState];
  if (!copy) {
    console.warn("customer_booking_status_unmapped");
    return { label: "Status update pending", nextStep: "Refresh this page later or contact support before taking action." };
  }
  if (state !== "FOR_REVIEW" || !requestedAt || !Number.isFinite(Date.parse(requestedAt))) return copy;
  return { ...copy, target: `Review target: ${formatManilaDateTime(new Date(Date.parse(requestedAt) + OWNER_REVIEW_TARGET_MS).toISOString())}` };
}
