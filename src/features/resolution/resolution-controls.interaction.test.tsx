/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { recordReturn, uploadConditionPhoto } = vi.hoisted(() => ({
  recordReturn: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));
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
  uploadConditionPhoto,
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

const resolutionWithInspection: ResolutionDetail = {
  ...resolution,
  booking_state: "RETURN_REVIEW",
  return_inspection: {
    accessories: [],
    actual_at: "2026-08-16T02:00:00Z",
    camera_condition_summary: "Returned clean.",
    camera_has_damage: false,
    condition_report_id: "94000000-0000-4000-8000-000000000020",
    expected_return_at: "2026-08-16T02:00:00Z",
    handoff_id: "94000000-0000-4000-8000-000000000021",
    has_missing_items: false,
    late_return: false,
    notes: null,
    photos: [
      {
        byte_size: 1024,
        created_at: "2026-08-16T02:00:00Z",
        media_type: "image/png",
        photo_id: "94000000-0000-4000-8000-000000000022",
        supersedes_photo_id: null,
      },
    ],
  },
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

it("identifies a rejected return-evidence upload", async () => {
  uploadConditionPhoto.mockResolvedValue({
    error: "invalid",
    fieldErrors: { photo: "Choose a non-empty JPEG or PNG no larger than 5 MiB." },
    status: "error",
  });
  render(<ResolutionControls actualAt="2026-08-16T10:00" operationIds={operationIds} resolution={resolutionWithInspection} />);

  const photo = screen.getByLabelText("Return condition photo");
  fireEvent.submit(screen.getByRole("button", { name: "Attach verified return photo" }).closest("form")!);
  await waitFor(() => expect(uploadConditionPhoto).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Choose a non-empty JPEG or PNG no larger than 5 MiB.");
  expect(photo.getAttribute("aria-invalid")).toBe("true");
  expect(photo.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("identifies only the rejected return-evidence replacement upload", async () => {
  uploadConditionPhoto.mockResolvedValue({
    error: "invalid",
    fieldErrors: { photo: "Choose a non-empty JPEG or PNG no larger than 5 MiB." },
    status: "error",
    supersedesPhotoId: "94000000-0000-4000-8000-000000000022",
  });
  render(<ResolutionControls actualAt="2026-08-16T10:00" operationIds={operationIds} resolution={resolutionWithInspection} />);

  const primaryPhoto = screen.getByLabelText("Return condition photo");
  const replacementPhoto = screen.getByLabelText("Replacement return condition photo 1");
  fireEvent.submit(replacementPhoto.closest("form")!);
  await waitFor(() => expect(uploadConditionPhoto).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Choose a non-empty JPEG or PNG no larger than 5 MiB.");
  expect(replacementPhoto.getAttribute("aria-invalid")).toBe("true");
  expect(replacementPhoto.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  expect(primaryPhoto.getAttribute("aria-invalid")).toBeNull();
});
