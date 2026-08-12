export const bookingStates = [
  "FOR_REVIEW",
  "CONTRACT_PENDING",
  "TO_PAY",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "ACTIVE",
  "RETURN_REVIEW",
  "ISSUE_REVIEW",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type BookingState = (typeof bookingStates)[number];

export const permittedBookingTransitions = {
  ACTIVE: ["RETURN_REVIEW"],
  CANCELLED: [],
  COMPLETED: [],
  CONFIRMED: ["ACTIVE", "CANCELLED"],
  CONTRACT_PENDING: ["TO_PAY", "EXPIRED", "CANCELLED"],
  EXPIRED: [],
  FOR_REVIEW: ["CONTRACT_PENDING", "REJECTED", "CANCELLED"],
  ISSUE_REVIEW: ["COMPLETED"],
  PAYMENT_REVIEW: ["CONFIRMED", "TO_PAY", "EXPIRED", "CANCELLED"],
  REJECTED: [],
  RETURN_REVIEW: ["ISSUE_REVIEW", "COMPLETED"],
  TO_PAY: ["PAYMENT_REVIEW", "CONTRACT_PENDING", "EXPIRED", "CANCELLED"],
} as const satisfies Record<BookingState, readonly BookingState[]>;

export const blockingBookingStates = new Set<BookingState>([
  "CONTRACT_PENDING",
  "TO_PAY",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "ACTIVE",
  "RETURN_REVIEW",
  "ISSUE_REVIEW",
]);

export function canTransition(from: BookingState, to: BookingState) {
  return (permittedBookingTransitions[from] as readonly BookingState[]).includes(
    to,
  );
}

export function isBeforeApprovalDeadline(now: Date, approvalDeadline: Date) {
  return now.getTime() < approvalDeadline.getTime();
}

export function stateAfterRejectedPayment(
  now: Date,
  approvalDeadline: Date,
): "TO_PAY" | "EXPIRED" {
  return isBeforeApprovalDeadline(now, approvalDeadline) ? "TO_PAY" : "EXPIRED";
}
