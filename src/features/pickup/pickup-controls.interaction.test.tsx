/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { completePickup, uploadConditionPhoto } = vi.hoisted(() => ({
  completePickup: vi.fn(),
  uploadConditionPhoto: vi.fn(),
}));
vi.mock("./actions", () => ({
  completePickup,
  requestAdminConditionPhotoAccess: vi.fn(),
  uploadConditionPhoto,
}));

import { PickupControls } from "./pickup-controls";
import type { PickupDetail } from "./types";

const pickup: PickupDetail = {
  accessories: [
    {
      id: "84000000-0000-4000-8000-000000000002",
      name: "Battery",
      quantity: 2,
    },
  ],
  booking_id: "84000000-0000-4000-8000-000000000001",
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

const activePickup: PickupDetail = {
  ...pickup,
  booking_state: "ACTIVE",
  handoff: {
    accessory_checklist_completed: true,
    actual_at: "2026-08-16T02:00:00Z",
    camera_serial_checked: true,
    condition_report_id: "84000000-0000-4000-8000-000000000006",
    condition_summary: "Clean and functional.",
    handoff_id: "84000000-0000-4000-8000-000000000007",
    named_renter_present: true,
    original_id_checked: true,
    original_id_matched: true,
    photos: [],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("identifies pickup controls after server validation rejects the checklist", async () => {
  completePickup.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      actualAt: "Enter a valid pickup date and time.",
      accessories: "Confirm each included accessory exactly once.",
      cameraSerial: "Enter the serial observed on the camera.",
      conditionSummary: "Record a 2–2,000 character starting condition.",
      notes: "Notes must be no longer than 2,000 characters.",
      originalId: "Check the original ID and confirm that it matches.",
      renter: "Confirm that the named renter is physically present.",
    },
    status: "error",
  });
  render(
    <PickupControls
      actualAt="2026-08-16T10:00"
      operationId="84000000-0000-4000-8000-000000000004"
      photoIntentId="84000000-0000-4000-8000-000000000005"
      pickup={pickup}
    />,
  );

  const controls = [
    [screen.getByLabelText("Actual pickup time (Asia/Manila)"), "Enter a valid pickup date and time."],
    [screen.getByRole("checkbox", { name: /named contract renter is physically present/ }), "Confirm that the named renter is physically present."],
    [screen.getByRole("checkbox", { name: "I inspected the original physical ID." }), "Check the original ID and confirm that it matches."],
    [screen.getByRole("checkbox", { name: /original ID photo and name match/ }), "Check the original ID and confirm that it matches."],
    [screen.getByLabelText("Serial observed on camera"), "Enter the serial observed on the camera."],
    [screen.getByRole("checkbox", { name: /Battery × 2 is present/ }), "Confirm each included accessory exactly once."],
    [screen.getByLabelText("Starting condition report"), "Record a 2–2,000 character starting condition."],
    [screen.getByLabelText("Private handoff notes (optional)"), "Notes must be no longer than 2,000 characters."],
  ] as const;
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Complete pickup and mark ACTIVE" })
      .closest("form")!,
  );
  await waitFor(() => expect(completePickup).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});

it("identifies the condition photo after server validation rejects it", async () => {
  uploadConditionPhoto.mockResolvedValue({
    error: "invalid",
    fieldErrors: { photo: "Choose a JPEG or PNG condition photo up to 5 MiB." },
    status: "error",
  });
  render(
    <PickupControls
      actualAt="2026-08-16T10:00"
      operationId="84000000-0000-4000-8000-000000000004"
      photoIntentId="84000000-0000-4000-8000-000000000005"
      pickup={activePickup}
    />,
  );

  const photo = screen.getByLabelText("Condition photo");
  fireEvent.submit(
    screen.getByRole("button", { name: "Attach private photo" }).closest("form")!,
  );
  await waitFor(() => expect(uploadConditionPhoto).toHaveBeenCalledTimes(1));

  const error = await screen.findByText(
    "Choose a JPEG or PNG condition photo up to 5 MiB.",
  );
  expect(photo.getAttribute("aria-invalid")).toBe("true");
  expect(photo.getAttribute("aria-describedby")).toContain(
    error.getAttribute("id"),
  );
});
