/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { recordReturn } = vi.hoisted(() => ({ recordReturn: vi.fn() }));
vi.mock("./actions", () => ({
  addIssueNote: vi.fn(),
  decideCancellation: vi.fn(),
  decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(),
  recordReturn,
  resolveIssue: vi.fn(),
  reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({
  requestAdminConditionPhotoAccess: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));

import {
  ResolutionControls,
  type ResolutionOperationIds,
} from "./resolution-controls";
import type { ResolutionDetail } from "./types";

const resolution: ResolutionDetail = {
  booking_id: "94000000-0000-4000-8000-000000000001",
  booking_state: "ACTIVE",
  camera: { id: "94000000-0000-4000-8000-000000000004", name: "Camera" },
  cancellation: null,
  deposit: {
    deduction_amount: 0,
    held_amount: 4000,
    refunded_amount: 0,
    remaining_refund_liability: 4000,
    status: "pending_refund",
  },
  expected_accessories: [
    {
      id: "94000000-0000-4000-8000-000000000002",
      name: "Battery",
      quantity: 2,
      replacement_value: 5000,
    },
  ],
  issue_decision: null,
  issue_notes: [],
  pickup_at: "2026-08-14T02:00:00Z",
  refunds: [],
  renter: { legal_name: "Named Renter", phone: "+639171234567" },
  return_at: "2026-08-16T02:00:00Z",
  return_inspection: null,
};

const operationIds: ResolutionOperationIds = {
  cancellation: "94000000-0000-4000-8000-000000000011",
  conditionPhoto: "94000000-0000-4000-8000-000000000017",
  issueNote: "94000000-0000-4000-8000-000000000012",
  recordReturn: "94000000-0000-4000-8000-000000000013",
  refund: "94000000-0000-4000-8000-000000000014",
  resolveIssue: "94000000-0000-4000-8000-000000000015",
  returnReview: "94000000-0000-4000-8000-000000000016",
  reversals: {},
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("identifies return-recording controls after server validation rejects them", async () => {
  recordReturn.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      accessories: "Record one return status for every inclusion.",
      actualAt: "Enter the actual return time.",
      cameraSerial: "Enter the observed serial.",
      conditionSummary: "Enter a 2–2,000 character condition report.",
      notes: "Notes cannot exceed 2,000 characters.",
    },
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIds}
      resolution={resolution}
    />,
  );

  const controls = [
    [screen.getByLabelText("Actual return time (Asia/Manila)"), "Enter the actual return time."],
    [screen.getByLabelText("Serial observed on the returned camera"), "Enter the observed serial."],
    [screen.getByLabelText("Battery × 2"), "Record one return status for every inclusion."],
    [screen.getByLabelText("Return condition report"), "Enter a 2–2,000 character condition report."],
    [screen.getByLabelText("Private notes (optional)"), "Notes cannot exceed 2,000 characters."],
  ] as const;
  fireEvent.submit(
    screen.getByRole("button", { name: "Record return for review" }).closest("form")!,
  );
  await waitFor(() => expect(recordReturn).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});
