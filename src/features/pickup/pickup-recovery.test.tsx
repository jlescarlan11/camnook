// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ completePickup: vi.fn(), uploadConditionPhoto: vi.fn(), requestAdminConditionPhotoAccess: vi.fn() }));
import { completePickup } from "./actions";
import { PickupControls } from "./pickup-controls";
import type { PickupDetail } from "./types";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("retains pickup inspection facts and retry identity after an uncertain outcome", async () => {
  vi.mocked(completePickup).mockResolvedValueOnce({ status: "error", error: "indeterminate" }).mockResolvedValue({ status: "success" });
  const pickup = {
    booking_id: "84000000-0000-4000-8000-000000000001", booking_state: "CONFIRMED",
    renter_legal_name: "Synthetic Renter", handoff: null, eligibility: { eligible: true },
    accessories: [{ id: "84000000-0000-4000-8000-000000000002", name: "Battery", quantity: 1 }],
  } as PickupDetail;
  const props = { actualAt: "2026-09-22T10:00:45", operationId: "84000000-0000-4000-8000-000000000003", photoIntentId: "84000000-0000-4000-8000-000000000004", pickup };
  const view = render(<PickupControls {...props} />);
  const initialTime = (screen.getByLabelText("Actual pickup time (Asia/Manila)") as HTMLInputElement).value;
  const user = userEvent.setup();
  const serial = screen.getByLabelText("Serial observed on camera") as HTMLInputElement;
  await user.type(serial, "SYNTHETIC-SERIAL");
  await user.type(screen.getByLabelText("Starting condition report"), "Synthetic camera in good condition.");
  await user.type(screen.getByLabelText("Private handoff notes (optional)"), "Synthetic handoff note.");
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: "Complete pickup and mark ACTIVE" }));
  await screen.findByText("The committed outcome could not be confirmed. Refresh before retrying.");
  view.rerender(<PickupControls {...props} actualAt="2026-09-22T10:02:15" operationId="84000000-0000-4000-8000-000000000005" />);
  expect(serial.value).toBe("SYNTHETIC-SERIAL");
  expect((screen.getByLabelText("Starting condition report") as HTMLTextAreaElement).value).toBe("Synthetic camera in good condition.");
  expect((screen.getByLabelText("Private handoff notes (optional)") as HTMLTextAreaElement).value).toBe("Synthetic handoff note.");
  expect(screen.getAllByRole("checkbox").every((node) => (node as HTMLInputElement).checked)).toBe(true);
  const data = new FormData(serial.form!);
  expect(data.get("operationId")).toBe(props.operationId);
  expect(data.get("actualAt")).toBe(initialTime);
  await user.click(screen.getByRole("button", { name: "Complete pickup and mark ACTIVE" }));
  await screen.findByText("Pickup was recorded exactly once. The persisted booking is ACTIVE.");
  expect((screen.getByRole("button", { name: "Complete pickup and mark ACTIVE" }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<PickupControls {...props} pickup={{ ...pickup, booking_id: "84000000-0000-4000-8000-000000000006" }} />);
  expect((screen.getByLabelText("Serial observed on camera") as HTMLInputElement).value).toBe("");
  expect(screen.getAllByRole("checkbox").every((node) => !(node as HTMLInputElement).checked)).toBe(true);
});
