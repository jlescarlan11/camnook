import type { RequestBookingActionState } from "../../src/features/bookings/actions/request-booking";

export async function requestBooking(_state: RequestBookingActionState, data: FormData): Promise<RequestBookingActionState> {
  if (new URLSearchParams(window.location.search).get("failure") === "transport") throw new Error("Synthetic interrupted rental request");
  window.dispatchEvent(new CustomEvent("usability-request", { detail: Object.fromEntries(data) }));
  if (String(data.get("legalName") ?? "").trim().length < 2) {
    return { status: "error", error: "invalid_input", fieldErrors: { legalName: "Enter your name." } };
  }
  // Stop at the action boundary; this harness never creates a booking.
  return { status: "error", error: "request_failed" };
}
