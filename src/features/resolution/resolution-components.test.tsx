import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addIssueNote: vi.fn(),
  decideCancellation: vi.fn(),
  decideReturnReview: vi.fn(),
  recordExternalRefund: vi.fn(),
  recordReturn: vi.fn(),
  requestCancellation: vi.fn(),
  resolveIssue: vi.fn(),
  reverseExternalRefund: vi.fn(),
}));
vi.mock("@/features/pickup/actions", () => ({
  requestAdminConditionPhotoAccess: vi.fn(),
  requestMyConditionPhotoAccess: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));

import { RenterResolutionStatus } from "./renter-resolution-status";
import {
  ResolutionControls,
  type ResolutionOperationIds,
} from "./resolution-controls";
import type { MyResolutionState, ResolutionDetail } from "./types";

const BOOKING_ID = "94000000-0000-4000-8000-000000000001";
const ACCESSORY_ID = "94000000-0000-4000-8000-000000000002";
const REQUEST_ID = "94000000-0000-4000-8000-000000000003";
const ids: ResolutionOperationIds = {
  cancellation: "94000000-0000-4000-8000-000000000011",
  issueNote: "94000000-0000-4000-8000-000000000012",
  recordReturn: "94000000-0000-4000-8000-000000000013",
  refund: "94000000-0000-4000-8000-000000000014",
  resolveIssue: "94000000-0000-4000-8000-000000000015",
  returnReview: "94000000-0000-4000-8000-000000000016",
  reversals: {},
};

function detail(state: ResolutionDetail["booking_state"]): ResolutionDetail {
  return {
    booking_id: BOOKING_ID,
    booking_state: state,
    camera: {
      id: "94000000-0000-4000-8000-000000000004",
      name: "Camera",
    },
    cancellation: null,
    deposit: {
      deduction_amount: 0,
      held_amount: 4000,
      refunded_amount: 0,
      remaining_refund_liability: 4000,
      status: "pending_refund",
    },
    expected_accessories: [
      { id: ACCESSORY_ID, name: "Battery", quantity: 2, replacement_value: 5000 },
    ],
    issue_decision: null,
    issue_notes: [],
    pickup_at: "2026-08-14T02:00:00Z",
    refunds: [],
    renter: { legal_name: "Named Renter", phone: "+639171234567" },
    return_at: "2026-08-16T02:00:00Z",
    return_inspection: null,
  };
}

describe("resolution UI", () => {
  it("collects actual return facts without rendering an automatic charge formula", () => {
    const markup = renderToStaticMarkup(
      <ResolutionControls
        actualAt="2026-08-16T10:00"
        operationIds={ids}
        resolution={detail("ACTIVE")}
      />,
    );

    for (const expected of [
      "Actual return time",
      "Serial observed on the returned camera",
      "Battery × 2",
      "Returned",
      "Missing",
      "Damaged",
      "Return condition report",
      "Record return for review",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).toContain('name="operationId"');
    expect(markup).not.toContain("PRIVATE-EXPECTED-SERIAL");
    expect(markup).not.toMatch(/automatic fee|per.hour|late charge/i);
  });

  it("disables paid cancellation acceptance while preserving an explicit decline", () => {
    const resolution = detail("CONFIRMED");
    resolution.cancellation = {
      acceptance_enabled: false,
      decision: null,
      disposition: "pending",
      reason: "Plans changed after payment.",
      request_id: REQUEST_ID,
      requested_at: "2026-08-16T02:00:00Z",
    };
    const markup = renderToStaticMarkup(
      <ResolutionControls
        actualAt="2026-08-16T10:00"
        operationIds={ids}
        resolution={resolution}
      />,
    );

    expect(markup).toContain("paid-cancellation fee and refund policy");
    expect(markup).toMatch(/disabled=""[^>]*value="accept"[^>]*name="decision"/);
    expect(markup).toContain("Decline request");
    expect(markup).not.toContain("Cancellation fee");
  });

  it("counts only current evidence versions against the six-photo limit", () => {
    const resolution = detail("RETURN_REVIEW");
    const photoIds = Array.from(
      { length: 7 },
      (_, index) => `94000000-0000-4000-8000-00000000010${index}`,
    );
    resolution.return_inspection = {
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
      photos: photoIds.map((photoId, index) => ({
        byte_size: 1024,
        created_at: `2026-08-16T02:00:0${index}Z`,
        media_type: "image/png",
        photo_id: photoId,
        supersedes_photo_id:
          index === 1 ? photoIds[0] : index === 2 ? photoIds[1] : null,
      })),
    };
    const markup = renderToStaticMarkup(
      <ResolutionControls
        actualAt="2026-08-16T10:00:00"
        operationIds={ids}
        resolution={resolution}
      />,
    );
    const attachButton = markup.match(
      /<button[^>]*>Attach verified return photo<\/button>/,
    )?.[0];

    expect(attachButton).toBeDefined();
    expect(attachButton).not.toMatch(/\sdisabled(?:=|>)/);
    expect(markup.match(/Historical superseded version/g)).toHaveLength(2);
    expect(markup.match(/Upload versioned replacement/g)).toHaveLength(5);
  });

  it("shows the renter only final explanations and owned deposit amounts", () => {
    const owner: MyResolutionState = {
      booking_id: BOOKING_ID,
      booking_state: "COMPLETED",
      can_request_cancellation: false,
      cancellation: null,
      deposit: {
        deduction_amount: 1000,
        held_amount: 4000,
        refunded_amount: 3000,
        remaining_refund_liability: 0,
        status: "refunded",
      },
      issue_decision: {
        customer_explanation: "PHP 1,000 was approved for documented body repair.",
        decided_at: "2026-08-16T03:00:00Z",
        decision_kind: "damage",
        deduction_amount: 1000,
      },
      return_inspection: {
        accessories: [
          { id: ACCESSORY_ID, name: "Battery", quantity: 2, return_status: "returned" },
        ],
        actual_at: "2026-08-16T02:00:00Z",
        camera_has_damage: true,
        expected_return_at: "2026-08-16T02:00:00Z",
        has_missing_items: false,
        late_return: false,
        photos: [],
      },
    };
    const markup = renderToStaticMarkup(
      <RenterResolutionStatus
        operationId="94000000-0000-4000-8000-000000000017"
        resolution={owner}
      />,
    );

    for (const expected of [
      "Final issue outcome",
      "PHP 1,000 was approved",
      "Verified deposit held",
      "Approved deduction",
      "Externally refunded",
      "Still owed to you",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).not.toMatch(/internal.reason|transfer.reference|object_path|sha256|PRIVATE-/i);
  });
});
