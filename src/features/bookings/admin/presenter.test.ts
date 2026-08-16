import { describe, expect, it } from "vitest";

import type { DecisionActionState } from "./actions";
import {
  decisionControlPresentation,
  nextRejectionReason,
  sharedDecisionPending,
} from "./presenter";

describe("admin decision control presentation", () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])("locks both controls when either action pending: %s/%s", (approve, reject, expected) => {
    expect(sharedDecisionPending(approve, reject)).toBe(expected);
  });

  it("preserves rejection text for correction, stale, and indeterminate results", () => {
    expect(
      nextRejectionReason("  Keep this operator context  ", {
        action: "reject",
        category: "stale",
        status: "stale",
      }),
    ).toBe("  Keep this operator context  ");
    expect(
      nextRejectionReason("Keep this too", {
        action: "reject",
        category: "indeterminate",
        status: "indeterminate",
      }),
    ).toBe("Keep this too");
  });

  it("clears rejection text only after a committed reject", () => {
    expect(
      nextRejectionReason("Dates unavailable", {
        action: "reject",
        committed: true,
        status: "success",
      }),
    ).toBe("");
    expect(
      nextRejectionReason("Dates unavailable", {
        action: "approve",
        committed: true,
        status: "success",
      }),
    ).toBe("Dates unavailable");
  });

  it("uses one pending contract to disable both decisions and announce progress", () => {
    expect(
      decisionControlPresentation(
        { action: "approve", status: "idle" },
        true,
        true,
      ),
    ).toEqual({
      ariaBusy: true,
      disableApprove: true,
      disableReject: true,
      liveMessage: "Saving the decision… Both controls are disabled.",
      role: "status",
      shouldFocusResult: false,
      tone: "pending",
    });
  });

  it("keeps rejection available while advisory readiness blocks approval", () => {
    expect(
      decisionControlPresentation({ status: "idle" }, false, false),
    ).toMatchObject({
      disableApprove: true,
      disableReject: false,
      liveMessage: undefined,
    });
  });

  it.each([
    [
      { action: "approve", committed: true as const, status: "success" as const },
      "Approval committed. Refreshing the persisted booking now.",
      "status",
    ],
    [
      { action: "reject", committed: true as const, status: "success" as const },
      "Rejection committed. Refreshing the persisted booking now.",
      "status",
    ],
    [
      { action: "approve", category: "availability_conflict" as const, status: "stale" as const },
      "These dates are no longer available. The current booking is being refreshed; review it before deciding again.",
      "alert",
    ],
    [
      { action: "approve", category: "stale" as const, status: "stale" as const },
      "This booking changed before the decision completed. Review the refreshed state before trying again.",
      "alert",
    ],
    [
      { action: "approve", category: "indeterminate" as const, status: "indeterminate" as const },
      "The outcome is uncertain. Refresh to confirm the persisted state before retrying.",
      "alert",
    ],
    [
      { action: "approve", category: "camera_unavailable" as const, status: "error" as const },
      "The camera is not currently available for approval.",
      "alert",
    ],
    [
      { action: "approve", category: "profile_inactive" as const, status: "error" as const },
      "The renter profile is not active. Approval remains blocked.",
      "alert",
    ],
    [
      { action: "approve", category: "template_unavailable" as const, status: "error" as const },
      "No active approved contract template is available. Approval remains blocked.",
      "alert",
    ],
    [
      { action: "approve", category: "template_invalid" as const, status: "error" as const },
      "The active contract template is incomplete. Approval remains blocked.",
      "alert",
    ],
    [
      { action: "approve", category: "invalid_period" as const, status: "error" as const },
      "The requested rental period is no longer valid for approval.",
      "alert",
    ],
    [
      { action: "approve", category: "price_unrepresentable" as const, status: "error" as const },
      "The authoritative price could not be represented safely. Approval remains blocked.",
      "alert",
    ],
    [
      { action: "approve", category: "not_found" as const, status: "stale" as const },
      "This booking could not be found. Review the refreshed queue before trying again.",
      "alert",
    ],
    [
      { action: "reject", category: "unauthorized" as const, status: "error" as const },
      "Administrator authorization is required. No decision was applied.",
      "alert",
    ],
  ] satisfies [DecisionActionState, string, string][])("presents an allowlisted result %#", (state, liveMessage, role) => {
    expect(decisionControlPresentation(state, false, true)).toMatchObject({
      liveMessage,
      role,
      shouldFocusResult: true,
    });
  });
});
