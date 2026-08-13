import {
  normalizeQuoteInputKey,
  type QuoteInput,
} from "./manila-time";
import type { QuoteActionState } from "./actions/quote-booking";

const quoteErrorMessages = {
  invalid_input: "Correct the highlighted fields and try again.",
  not_quotable: "This camera or rental period can’t be quoted right now.",
  retryable:
    "We couldn’t get a quote. Your entries are preserved; please retry.",
} as const;

export function nextQuoteEditGeneration(current: number) {
  return current + 1;
}

export function quoteFormPresentation(
  state: QuoteActionState,
  input: QuoteInput,
  pending: boolean,
  editGeneration: number,
) {
  const isCurrent =
    state.status === "success" &&
    state.inputKey === normalizeQuoteInputKey(input) &&
    state.submissionGeneration === editGeneration &&
    Boolean(state.quote);

  return {
    canContinue: isCurrent && !pending,
    disableQuoteSubmit: pending,
    liveMessage: pending
      ? "Getting the authoritative quote…"
      : state.error
        ? quoteErrorMessages[state.error]
        : isCurrent
          ? "Quote ready."
          : undefined,
    quote: isCurrent ? state.quote! : null,
  };
}
