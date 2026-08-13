import type { ProfileActionState } from "./actions/profile";
import type { QuoteActionState } from "./actions/quote-booking";
import type { RequestBookingActionState } from "./actions/request-booking";

export const initialProfileActionState: ProfileActionState = { status: "idle" };
export const initialQuoteActionState: QuoteActionState = { status: "idle" };
export const initialRequestBookingActionState: RequestBookingActionState = {
  status: "idle",
};
