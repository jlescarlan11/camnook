import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  completePickup: vi.fn(),
  requestAdminConditionPhotoAccess: vi.fn(),
  requestMyConditionPhotoAccess: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));

import { PickupControls } from "./pickup-controls";
import { RenterPickupStatus } from "./renter-pickup-status";
import type { MyPickupState, PickupDetail } from "./types";

const BOOKING_ID = "84000000-0000-4000-8000-000000000001";

const confirmedDetail: PickupDetail = {
  accessories: [
    {
      id: "84000000-0000-4000-8000-000000000002",
      name: "Battery",
      quantity: 2,
    },
  ],
  booking_id: BOOKING_ID,
  booking_state: "CONFIRMED",
  eligibility: {
    booking_confirmed: true,
    contract_current_signed: true,
    eligible: true,
    in_person_identity_check_required: true,
    payment_verified: true,
    profile_active: true,
  },
  handoff: null,
  identity_check: {
    mode: "original_id_in_person_no_copy",
    retains_id_copy: false,
    retains_id_number: false,
  },
  renter_legal_name: "Named Renter",
};

const confirmedOwner: MyPickupState = {
  booking_id: BOOKING_ID,
  booking_state: "CONFIRMED",
  handoff: null,
  pickup_at: "2026-08-16T02:00:00Z",
  return_at: "2026-08-18T02:00:00Z",
  timeline: [],
};

describe("pickup UI privacy and checklist controls", () => {
  it("renders every required admin fact without revealing the expected serial", () => {
    const markup = renderToStaticMarkup(
      <PickupControls
        actualAt="2026-08-16T10:00"
        operationId="84000000-0000-4000-8000-000000000004"
        pickup={confirmedDetail}
      />,
    );

    for (const expected of [
      "Named Renter",
      "original physical ID",
      "Serial observed on camera",
      "Battery × 2",
      "Starting condition report",
      "Complete pickup and mark ACTIVE",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).toContain('name="operationId"');
    expect(markup).toContain('name="accessoryId"');
    expect(markup).not.toContain("PRIVATE-SERIAL");
    expect(markup).toContain("Do not photograph it or record its number");
    expect(markup).not.toMatch(/object_path|sha256|late.amount/i);
  });

  it("shows confirmed renters all configured instructions and no private camera fact", () => {
    const markup = renderToStaticMarkup(
      <RenterPickupStatus
        instructions={{
          contact: "+63 917 123 4567",
          location: "Private pickup counter",
          process: "Present the original ID before equipment checks.",
        }}
        pickup={confirmedOwner}
      />,
    );

    for (const expected of [
      "Pickup instructions",
      "Schedule",
      "Private pickup counter",
      "+63 917 123 4567",
      "Present the original ID",
      "substitutes are not allowed",
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).not.toContain("camera serial");
    expect(markup).not.toContain("another renter");
  });

  it("shows only a safe active handoff summary and expected return", () => {
    const active: MyPickupState = {
      ...confirmedOwner,
      booking_state: "ACTIVE",
      handoff: {
        accessory_checklist_completed: true,
        actual_at: "2026-08-16T02:00:00Z",
        camera_serial_checked: true,
        condition_photo_count: 0,
        condition_report_complete: true,
        named_renter_present: true,
        original_id_checked: true,
        original_id_matched: true,
        photos: [],
      },
      timeline: [
        {
          from_state: "CONFIRMED",
          occurred_at: "2026-08-16T02:00:00Z",
          reason_code: "pickup_completed",
          to_state: "ACTIVE",
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <RenterPickupStatus instructions={null} pickup={active} />,
    );

    expect(markup).toContain("The rental is ACTIVE");
    expect(markup).toContain("Expected return");
    expect(markup).toContain("Written condition report recorded");
    expect(markup).not.toContain("Pickup instructions");
    expect(markup).not.toMatch(/condition summary|serial number|object_path|sha256/i);
  });
});
