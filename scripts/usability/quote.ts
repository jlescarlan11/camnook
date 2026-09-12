import type { QuoteActionState } from "../../src/features/bookings/actions/quote-booking";
import { normalizeScheduleQuoteInputKey } from "../../src/features/bookings/manila-time";

let failNext = false;
export function failNextQuote() { failNext = true; }

export async function quoteBooking(_previous: QuoteActionState, form: FormData): Promise<QuoteActionState> {
  const input = Object.fromEntries(["camera", "pickupDate", "returnDate", "handoffTime", "policyVersion"].map(key => [key, String(form.get(key) ?? "")])) as Parameters<typeof normalizeScheduleQuoteInputKey>[0];
  await new Promise(resolve => setTimeout(resolve, 250));
  if (failNext) {
    failNext = false;
    return { status: "error", error: "retryable", inputKey: normalizeScheduleQuoteInputKey(input), submissionGeneration: Number(form.get("generation")) };
  }
  const pickupAt = `${input.pickupDate}T${input.handoffTime}:00+08:00`;
  const returnAt = `${input.returnDate}T${input.handoffTime}:00+08:00`;
  const billableDays = Math.ceil((Date.parse(returnAt) - Date.parse(pickupAt)) / 86_400_000);
  return { status: "success", inputKey: normalizeScheduleQuoteInputKey(input), submissionGeneration: Number(form.get("generation")), quote: { cameraId: input.camera, currency: "PHP", pickupAt, returnAt, billableDays, dailyRate: 450, rentalAmount: billableDays * 450, securityDeposit: 1000, totalDue: billableDays * 450 + 1000 } };
}
