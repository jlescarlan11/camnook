import { describe, expect, it } from "vitest";

import {
  blockingBookingStates,
  bookingStates,
  canTransition,
  isBeforeApprovalDeadline,
  permittedBookingTransitions,
  stateAfterRejectedPayment,
} from "./state-machine";

describe("booking state policy", () => {
  it("covers every authoritative state exactly once", () => {
    expect(Object.keys(permittedBookingTransitions).sort()).toEqual(
      [...bookingStates].sort(),
    );
  });

  it("keeps requests non-blocking until approval", () => {
    expect(blockingBookingStates.has("FOR_REVIEW")).toBe(false);
    expect(blockingBookingStates.has("CONTRACT_PENDING")).toBe(true);
  });

  it("preserves timely payment review and supports late rejection expiry", () => {
    expect(canTransition("PAYMENT_REVIEW", "TO_PAY")).toBe(true);
    expect(canTransition("PAYMENT_REVIEW", "EXPIRED")).toBe(true);
  });

  it("accepts payment before, but never at, the immutable deadline", () => {
    const deadline = new Date("2026-08-14T00:00:00.000Z");

    expect(
      isBeforeApprovalDeadline(
        new Date("2026-08-13T23:59:59.999Z"),
        deadline,
      ),
    ).toBe(true);
    expect(isBeforeApprovalDeadline(deadline, deadline)).toBe(false);
  });

  it("chooses retry or expiry on the correct side of the deadline", () => {
    const deadline = new Date("2026-08-14T00:00:00.000Z");

    expect(
      stateAfterRejectedPayment(
        new Date("2026-08-13T23:59:59.999Z"),
        deadline,
      ),
    ).toBe("TO_PAY");
    expect(stateAfterRejectedPayment(deadline, deadline)).toBe("EXPIRED");
  });

  it.each(["COMPLETED", "REJECTED", "EXPIRED", "CANCELLED"] as const)(
    "%s is terminal",
    (state) => {
      expect(permittedBookingTransitions[state]).toEqual([]);
      expect(blockingBookingStates.has(state)).toBe(false);
    },
  );
});
