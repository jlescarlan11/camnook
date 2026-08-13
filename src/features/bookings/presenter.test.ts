import { describe, expect, it } from "vitest";

import {
  nextQuoteEditGeneration,
  quoteFormPresentation,
} from "./presenter";

const input = {
  camera: "11111111-1111-4111-8111-111111111111",
  pickup: "2099-08-14T09:00",
  return: "2099-08-15T09:00",
};

describe("quote form presentation", () => {
  it("advances monotonically across an A to B to A edit sequence", () => {
    const afterB = nextQuoteEditGeneration(0);
    const afterAAgain = nextQuoteEditGeneration(afterB);

    expect(afterB).toBe(1);
    expect(afterAAgain).toBe(2);
  });

  it("exposes pending state while disabling only quote submission", () => {
    expect(quoteFormPresentation({ status: "idle" }, input, true, 0)).toEqual({
      canContinue: false,
      disableQuoteSubmit: true,
      liveMessage: "Getting the authoritative quote…",
      quote: null,
    });
  });

  it("shows a successful quote only while its normalized inputs are current", () => {
    const state = {
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:00"]',
      quote: {
        billableDays: 1,
        cameraId: input.camera,
        currency: "PHP" as const,
        dailyRate: 1500,
        pickupAt: "2099-08-14T09:00:00+08:00",
        rentalAmount: 1500,
        returnAt: "2099-08-15T09:00:00+08:00",
        securityDeposit: 5000,
        totalDue: 6500,
      },
      submissionGeneration: 0,
      status: "success" as const,
    };

    expect(quoteFormPresentation(state, input, false, 0)).toMatchObject({
      canContinue: true,
      quote: { totalDue: 6500 },
    });
    for (const changed of [
      { ...input, camera: "33333333-3333-4333-8333-333333333333" },
      { ...input, pickup: "2099-08-14T09:01" },
      { ...input, return: "2099-08-15T09:01" },
    ]) {
      expect(quoteFormPresentation(state, changed, false, 1)).toMatchObject({
        canContinue: false,
        quote: null,
      });
    }
  });

  it("does not resurrect an old quote after inputs change from A to B to A", () => {
    const oldResult = {
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:00"]',
      quote: {
        billableDays: 1,
        cameraId: input.camera,
        currency: "PHP" as const,
        dailyRate: 1500,
        pickupAt: "2099-08-14T09:00:00+08:00",
        rentalAmount: 1500,
        returnAt: "2099-08-15T09:00:00+08:00",
        securityDeposit: 5000,
        totalDue: 6500,
      },
      submissionGeneration: 0,
      status: "success" as const,
    };

    expect(quoteFormPresentation(oldResult, input, false, 2)).toMatchObject({
      canContinue: false,
      quote: null,
    });
  });

  it("discards a successful response when the fields changed while it was pending", () => {
    const staleResponse = {
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:00"]',
      quote: {
        billableDays: 1,
        cameraId: input.camera,
        currency: "PHP" as const,
        dailyRate: 1500,
        pickupAt: "2099-08-14T09:00:00+08:00",
        rentalAmount: 1500,
        returnAt: "2099-08-15T09:00:00+08:00",
        securityDeposit: 5000,
        totalDue: 6500,
      },
      submissionGeneration: 4,
      status: "success" as const,
    };

    expect(quoteFormPresentation(staleResponse, input, false, 5)).toMatchObject({
      canContinue: false,
      quote: null,
    });
  });

  it.each([
    ["under 24 hours", 1, 101.01, 102.02, 103.03, 104.04],
    ["exactly 24 hours", 1, 201.01, 202.02, 203.03, 204.04],
    ["over 24 hours", 2, 301.01, 302.02, 303.03, 304.04],
  ])("passes through every authoritative %s quote value", (_label, days, daily, rental, deposit, total) => {
    const quote = {
      billableDays: days,
      cameraId: input.camera,
      currency: "PHP" as const,
      dailyRate: daily,
      pickupAt: "2099-08-14T09:00:00+08:00",
      rentalAmount: rental,
      returnAt: "2099-08-15T09:00:00+08:00",
      securityDeposit: deposit,
      totalDue: total,
    };
    const result = quoteFormPresentation(
      {
        inputKey:
          '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:00"]',
        quote,
        submissionGeneration: 3,
        status: "success",
      },
      input,
      false,
      3,
    );

    expect(result.quote).toEqual(quote);
  });

  it.each(["invalid_input", "not_quotable", "retryable"] as const)(
    "never preserves an older quote after a later %s result",
    (error) => {
      const result = quoteFormPresentation(
        {
          error,
          inputKey:
            '["11111111-1111-4111-8111-111111111111","2099-08-14T09:00","2099-08-15T09:00"]',
          quote: {
            billableDays: 1,
            cameraId: input.camera,
            currency: "PHP",
            dailyRate: 1,
            pickupAt: "2099-08-14T09:00:00+08:00",
            rentalAmount: 1,
            returnAt: "2099-08-15T09:00:00+08:00",
            securityDeposit: 1,
            totalDue: 1,
          },
          submissionGeneration: 1,
          status: "error",
        },
        input,
        false,
        1,
      );
      expect(result).toMatchObject({ canContinue: false, quote: null });
    },
  );

  it.each([
    ["invalid_input", "Correct the highlighted fields and try again."],
    ["not_quotable", "This camera or rental period can’t be quoted right now."],
    ["retryable", "We couldn’t get a quote. Your entries are preserved; please retry."],
  ] as const)("maps %s to constrained recovery copy", (error, message) => {
    expect(
      quoteFormPresentation({ error, status: "error" }, input, false, 0),
    ).toMatchObject({ canContinue: false, liveMessage: message, quote: null });
  });
});
