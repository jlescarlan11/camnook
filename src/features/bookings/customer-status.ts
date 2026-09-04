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

export type RentalProgressStep = {
  label: string;
  state: "complete" | "current" | "upcoming";
};

const progressOrder = ["request", "approval", "meetup", "contract_payment", "pickup", "return"] as const;

export function customerRentalProgress(state: string): RentalProgressStep[] {
  const currentIndex: Record<string, number> = {
    FOR_REVIEW: 1,
    CONTRACT_PENDING: 2,
    TO_PAY: 3,
    PAYMENT_REVIEW: 3,
    CONFIRMED: 4,
    ACTIVE: 5,
    RETURN_REVIEW: 5,
    ISSUE_REVIEW: 5,
    COMPLETED: 6,
  };
  const index = currentIndex[state] ?? (["REJECTED", "EXPIRED", "CANCELLED"].includes(state) ? 1 : 0);
  const labels = ["Request submitted", "Owner approval", "Meetup", "Contract & payment", "Pickup", "Return"];
  return progressOrder.map((_, step) => ({
    label: labels[step],
    state: step < index ? "complete" : step === index ? "current" : "upcoming",
  }));
}

export function customerNextAction(state: string, approvalDeadline?: string) {
  if (state === "FOR_REVIEW") return { action: null, body: "No action needed. We’ll notify you when the owner responds.", title: "Awaiting owner approval" };
  if (state === "CONTRACT_PENDING") return { action: "Review & sign agreement", body: `Your rental was approved. Review the agreement${approvalDeadline ? ` before ${formatManilaDateTime(approvalDeadline)}` : ""}.`, title: "Action required" };
  if (state === "TO_PAY") return { action: "Pay", body: `Complete payment${approvalDeadline ? ` before ${formatManilaDateTime(approvalDeadline)}` : ""}.`, title: "Action required" };
  if (state === "PAYMENT_REVIEW") return { action: null, body: "No action needed. Your payment proof is being reviewed.", title: "Payment under review" };
  if (state === "CONFIRMED") return { action: "View pickup details", body: "Your booking is confirmed. Review the meetup and pickup details.", title: "Prepare for pickup" };
  if (state === "ACTIVE") return { action: "View return details", body: "The camera is with you. Return it at the confirmed time and place.", title: "Rental in progress" };
  return { action: null, body: presentCustomerBookingStatus(state).nextStep, title: presentCustomerBookingStatus(state).label };
}
