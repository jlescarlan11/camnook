import { describe, expect, it } from "vitest";

import {
  activeRentalQueueSchema,
  myPickupStateSchema,
  pickupDetailSchema,
  pickupQueueSchema,
} from "./types";

const BOOKING_ID = "81000000-0000-4000-8000-000000000001";
const ACCESSORY_ID = "81000000-0000-4000-8000-000000000002";
const VERIFICATION_ID = "81000000-0000-4000-8000-000000000003";

const eligibility = {
  booking_confirmed: true,
  contract_current_signed: true,
  eligible: true,
  payment_verified: true,
  profile_active: true,
  verification_current: true,
};

describe("pickup projection schemas", () => {
  it("accepts minimized admin pickup data and rejects private or monetary fields", () => {
    const queue = [
      {
        accessory_count: 1,
        booking_id: BOOKING_ID,
        camera_name: "Camera",
        pickup_at: "2026-08-16T02:00:00Z",
        readiness: eligibility,
        renter_legal_name: "Named Renter",
        required_checks: [
          "named_renter_present",
          "original_id_checked",
          "original_id_matched",
          "camera_serial_confirmed",
          "included_accessories_confirmed",
          "condition_report_complete",
        ],
        return_at: "2026-08-18T02:00:00Z",
        verification_expiration_date: "2027-08-16",
      },
    ];
    const detail = {
      accessories: [{ id: ACCESSORY_ID, name: "Battery", quantity: 1 }],
      booking_id: BOOKING_ID,
      booking_state: "CONFIRMED",
      eligibility,
      handoff: null,
      renter_legal_name: "Named Renter",
      verification: {
        document_expiration_date: "2027-08-16",
        id_type: "passport",
        record_id: VERIFICATION_ID,
        status: "verified",
      },
    };

    expect(pickupQueueSchema.safeParse(queue).success).toBe(true);
    expect(pickupDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      pickupQueueSchema.safeParse([
        { ...queue[0], camera_serial: "PRIVATE-SERIAL" },
      ]).success,
    ).toBe(false);
    expect(
      pickupDetailSchema.safeParse({
        ...detail,
        accessories: [
          { ...detail.accessories[0], replacement_value: 5000 },
        ],
      }).success,
    ).toBe(false);
    expect(
      pickupDetailSchema.safeParse({ ...detail, object_path: "private/path" })
        .success,
    ).toBe(false);
  });

  it("keeps owner handoff and active-rental contracts strict", () => {
    const owner = {
      booking_id: BOOKING_ID,
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
      pickup_at: "2026-08-16T02:00:00Z",
      return_at: "2026-08-18T02:00:00Z",
      timeline: [
        {
          from_state: "CONFIRMED",
          occurred_at: "2026-08-16T02:00:00Z",
          reason_code: "pickup_completed",
          to_state: "ACTIVE",
        },
      ],
    };
    const activeQueue = [
      {
        actual_pickup_at: "2026-08-16T02:00:00Z",
        booking_id: BOOKING_ID,
        camera_name: "Camera",
        expected_return_at: "2026-08-18T02:00:00Z",
        renter_legal_name: "Named Renter",
        renter_phone: "+639171234567",
        urgency: "upcoming",
      },
    ];

    expect(myPickupStateSchema.safeParse(owner).success).toBe(true);
    expect(activeRentalQueueSchema.safeParse(activeQueue).success).toBe(true);
    expect(
      myPickupStateSchema.safeParse({
        ...owner,
        camera_serial: "PRIVATE-SERIAL",
      }).success,
    ).toBe(false);
    expect(
      activeRentalQueueSchema.safeParse([
        { ...activeQueue[0], late_amount: 1000 },
      ]).success,
    ).toBe(false);
  });
});
