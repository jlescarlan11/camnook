import type { DecisionActionState } from "./actions";

export function sharedDecisionPending(
  approvePending: boolean,
  rejectPending: boolean,
) {
  return approvePending || rejectPending;
}

export function nextRejectionReason(
  current: string,
  state: DecisionActionState,
) {
  if (state.action !== "reject") return current;
  if (state.status === "success" && state.committed) return "";
  return current;
}

const categoryMessages = {
  availability_conflict:
    "These dates are no longer available. The current booking is being refreshed; review it before deciding again.",
  camera_unavailable:
    "The camera is not currently available for approval.",
  indeterminate:
    "The outcome is uncertain. Refresh to confirm the persisted state before retrying.",
  invalid_period: "The requested rental period is no longer valid for approval.",
  not_found:
    "This booking could not be found. Review the refreshed queue before trying again.",
  price_unrepresentable:
    "The authoritative price could not be represented safely. Approval remains blocked.",
  profile_inactive: "The renter profile is not active. Approval remains blocked.",
  stale:
    "This booking changed before the decision completed. Review the refreshed state before trying again.",
  template_invalid:
    "The active contract template is incomplete. Approval remains blocked.",
  template_unavailable:
    "No active approved contract template is available. Approval remains blocked.",
  unauthorized:
    "Administrator authorization is required. No decision was applied.",
} as const;

export function decisionControlPresentation(
  state: DecisionActionState,
  pending: boolean,
  ready: boolean,
) {
  let liveMessage: string | undefined;
  if (pending) {
    liveMessage = "Saving the decision… Both controls are disabled.";
  } else if (state.status === "success") {
    liveMessage =
      state.action === "reject"
        ? "Rejection committed. Refreshing the persisted booking now."
        : "Approval committed. Refreshing the persisted booking now.";
  } else if (state.category) {
    liveMessage = categoryMessages[state.category];
  } else if (state.status === "error") {
    liveMessage = "Correct the highlighted field and try again.";
  }

  const isErrorResult =
    state.status === "error" ||
    state.status === "indeterminate" ||
    state.status === "stale";

  return {
    ariaBusy: pending,
    disableApprove: pending || !ready,
    disableReject: pending,
    liveMessage,
    role: isErrorResult ? ("alert" as const) : ("status" as const),
    shouldFocusResult: !pending && state.status !== "idle",
    tone: pending
      ? ("pending" as const)
      : isErrorResult
        ? ("error" as const)
        : state.status === "success"
          ? ("success" as const)
          : ("idle" as const),
  };
}
