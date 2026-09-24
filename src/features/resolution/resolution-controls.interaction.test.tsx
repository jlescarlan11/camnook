/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { addIssueNote, decideCancellation, recordExternalRefund, recordReturn, resolveIssue, reverseExternalRefund, uploadConditionPhoto } = vi.hoisted(() => ({
  addIssueNote: vi.fn(),
  decideCancellation: vi.fn(),
  recordExternalRefund: vi.fn(),
  recordReturn: vi.fn(),
  resolveIssue: vi.fn(),
  reverseExternalRefund: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));
vi.mock("./actions", () => ({
  addIssueNote,
  decideCancellation,
  decideReturnReview: vi.fn(),
  recordExternalRefund,
  recordReturn,
  resolveIssue,
  reverseExternalRefund,
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

const resolutionWithCancellation: ResolutionDetail = {
  ...resolution,
  booking_state: "CONFIRMED",
  cancellation: {
    acceptance_enabled: true,
    decision: null,
    disposition: "pending",
    reason: "Plans changed.",
    request_id: "94000000-0000-4000-8000-000000000023",
    requested_at: "2026-08-16T02:00:00Z",
  },
};

const resolutionWithRefund: ResolutionDetail = {
  ...resolution,
  booking_state: "COMPLETED",
};

const reversibleRefundId = "94000000-0000-4000-8000-000000000024";
const otherReversibleRefundId = "94000000-0000-4000-8000-000000000026";
const resolutionWithReversibleRefund: ResolutionDetail = {
  ...resolutionWithRefund,
  refunds: [
    {
      amount: 4000,
      entry_kind: "refund",
      external_moved_at: "2026-08-16T02:00:00Z",
      reference_last4: "1234",
      refund_record_id: reversibleRefundId,
      reversal_of_refund_record_id: null,
      reversal_reason: null,
    },
    {
      amount: 1200,
      entry_kind: "refund",
      external_moved_at: "2026-08-16T03:00:00Z",
      reference_last4: "5678",
      refund_record_id: otherReversibleRefundId,
      reversal_of_refund_record_id: null,
      reversal_reason: null,
    },
  ],
};
const operationIdsWithReversal: ResolutionOperationIds = {
  ...operationIds,
  reversals: {
    [reversibleRefundId]: "94000000-0000-4000-8000-000000000025",
    [otherReversibleRefundId]: "94000000-0000-4000-8000-000000000027",
  },
};

const resolutionWithIssueReview: ResolutionDetail = {
  ...resolution,
  booking_state: "ISSUE_REVIEW",
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

it("identifies the owner cancellation decision reason after server validation rejects it", async () => {
  decideCancellation.mockResolvedValue({
    error: "invalid",
    fieldErrors: { reason: "Enter a 2–1,000 character cancellation reason." },
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIds}
      resolution={resolutionWithCancellation}
    />,
  );

  const reason = screen.getByRole("textbox", { name: "Decision reason" });
  fireEvent.submit(screen.getByRole("button", { name: "Decline request" }).closest("form")!);
  await waitFor(() => expect(decideCancellation).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Enter a 2–1,000 character cancellation reason.");
  expect(reason.getAttribute("aria-invalid")).toBe("true");
  expect(reason.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("identifies external-refund fields after server validation rejects them", async () => {
  recordExternalRefund.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      amount: "Enter the actual amount moved.",
      externalMovedAt: "Enter the actual movement time.",
      recipientName: "Enter the recipient's name.",
      reference: "Enter the recorded GCash reference.",
    },
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIds}
      resolution={resolutionWithRefund}
    />,
  );

  const controls = [
    [screen.getByLabelText("Actual amount moved (PHP)"), "Enter the actual amount moved."],
    [screen.getByLabelText("Outgoing GCash reference"), "Enter the recorded GCash reference."],
    [screen.getByLabelText("Recipient name"), "Enter the recipient's name."],
    [screen.getByLabelText("Actual movement time (Asia/Manila)"), "Enter the actual movement time."],
  ] as const;
  fireEvent.submit(
    screen.getByRole("button", { name: "Record completed external refund" }).closest("form")!,
  );
  await waitFor(() => expect(recordExternalRefund).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});

it("identifies a private issue note after server validation rejects it", async () => {
  addIssueNote.mockResolvedValue({
    error: "invalid",
    fieldErrors: { note: "Enter a 2–2,000 character issue note." },
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIds}
      resolution={resolutionWithIssueReview}
    />,
  );

  const note = screen.getByRole("textbox", { name: "Private issue note" });
  fireEvent.submit(screen.getByRole("button", { name: "Append private note" }).closest("form")!);
  await waitFor(() => expect(addIssueNote).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Enter a 2–2,000 character issue note.");
  expect(note.getAttribute("aria-invalid")).toBe("true");
  expect(note.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("identifies issue-decision fields after server validation rejects them", async () => {
  resolveIssue.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      customerExplanation: "Enter a 2–500 character renter-visible explanation.",
      decisionKind: "Choose a documented issue decision.",
      deductionAmount: "Enter a zero or positive manual deduction.",
      internalReason: "Enter a 2–2,000 character internal reason.",
    },
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIds}
      resolution={resolutionWithIssueReview}
    />,
  );

  const controls = [
    [screen.getByRole("combobox", { name: "Decision kind" }), "Choose a documented issue decision."],
    [screen.getByRole("spinbutton", { name: "Manual deduction amount (PHP)" }), "Enter a zero or positive manual deduction."],
    [screen.getByRole("textbox", { name: "Private internal reason and evidence basis" }), "Enter a 2–2,000 character internal reason."],
    [screen.getByRole("textbox", { name: "Renter-visible explanation" }), "Enter a 2–500 character renter-visible explanation."],
  ] as const;
  fireEvent.submit(screen.getByRole("button", { name: "Record decision and complete booking" }).closest("form")!);
  await waitFor(() => expect(resolveIssue).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});

it("identifies reversal fields only for the rejected refund record", async () => {
  reverseExternalRefund.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      counterpartyName: "Enter the counterparty's name.",
      externalMovedAt: "Enter the actual correction time.",
      reason: "Enter a 2–1,000 character correction reason.",
      reference: "Enter the recorded GCash reference.",
    },
    refundRecordId: reversibleRefundId,
    status: "error",
  });
  render(
    <ResolutionControls
      actualAt="2026-08-16T10:00"
      operationIds={operationIdsWithReversal}
      resolution={resolutionWithReversibleRefund}
    />,
  );

  const [targetButton, untouchedButton] = screen.getAllByRole("button", {
    name: "Append offsetting reversal",
  });
  const targetForm = targetButton.closest("form")!;
  const untouchedForm = untouchedButton.closest("form")!;
  const controls = [
    [within(targetForm).getByLabelText("Incoming reversal reference"), "Enter the recorded GCash reference."],
    [within(targetForm).getByLabelText("Counterparty name"), "Enter the counterparty's name."],
    [within(targetForm).getByLabelText("Actual reversal time (Asia/Manila)"), "Enter the actual correction time."],
    [within(targetForm).getByLabelText("Correction reason"), "Enter a 2–1,000 character correction reason."],
  ] as const;
  fireEvent.submit(targetForm);
  await waitFor(() => expect(reverseExternalRefund).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
  expect(
    within(untouchedForm)
      .getByLabelText("Incoming reversal reference")
      .getAttribute("aria-invalid"),
  ).toBeNull();
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
