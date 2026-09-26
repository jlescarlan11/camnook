/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const { action, push } = vi.hoisted(() => ({ action: vi.fn(), push: vi.fn() }));
vi.mock("@/features/bookings/actions/request-booking", () => ({ requestBooking: action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
import { testMeetupPlace } from "@/features/meetups/place-fixture.test-helper";
import { RequestForm } from "./request-form";
const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage;
const props = {
  camera: "11111111-1111-4111-8111-111111111111", draftKey: "request:renter-a:camera-a",
  profile: { legalName: "Test Renter", phone: "09170000000" }, meetupPlaces: [testMeetupPlace],
  schedule: { pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00", policyVersion: "1" },
  summary: { cameraName: "Camera", dates: "Aug 24–26", handoffTime: "9 AM", rentalAmount: "₱900", securityDeposit: "₱1000", totalDue: "₱1900" },
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); vi.clearAllMocks(); });
async function fillDraft() {
  await userEvent.click(screen.getByRole("radio"));
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Portrait practice");
  await userEvent.type(screen.getByRole("textbox", { name: "Shooting city" }), "Cebu City");
}
function operation(container: HTMLElement) { return container.querySelector<HTMLInputElement>('[name="operationId"]')!.value; }
it("restores answers and operation after navigation or reload, requiring review again", async () => {
  const first = render(<RequestForm {...props} />); await fillDraft();
  const id = operation(first.container); first.unmount();
  const next = render(<RequestForm {...props} />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe("Portrait practice");
  expect((screen.getByRole("textbox", { name: "Shooting city" }) as HTMLInputElement).value).toBe("Cebu City");
  expect((screen.getByRole("radio") as HTMLInputElement).checked).toBe(true);
  expect(operation(next.container)).toBe(id);
  expect(screen.queryByRole("button", { name: "Submit rental request" })).toBeNull();
});
it("keeps answers for new dates but uses a new operation and current profile", async () => {
  const first = render(<RequestForm {...props} />); await fillDraft();
  const id = operation(first.container); first.unmount();
  const next = render(<RequestForm {...props} profile={{ ...props.profile, legalName: "Updated Renter" }} schedule={{ ...props.schedule, returnDate: "2099-08-27" }} />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe("Portrait practice");
  expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Updated Renter");
  expect(operation(next.container)).not.toBe(id);
});
it("isolates other accounts/cameras and rejects stale meetup versions", async () => {
  const first = render(<RequestForm {...props} />); await fillDraft(); first.unmount();
  const other = render(<RequestForm {...props} draftKey="request:renter-b:camera-a" />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe(""); other.unmount();
  render(<RequestForm {...props} meetupPlaces={[{ ...testMeetupPlace, version: 2 }]} />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe("Portrait practice");
  expect((screen.getByRole("radio") as HTMLInputElement).checked).toBe(false);
});
it("clears only the completed draft after a confirmed booking and navigates to it", async () => {
  const bookingId = "22222222-2222-4222-8222-222222222222";
  action.mockResolvedValue({ status: "success", bookingId });
  sessionStorage.setItem("unrelated", "keep");
  render(<RequestForm {...props} />); await fillDraft();
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/account/bookings/${bookingId}?requested=1`));
  expect(sessionStorage.getItem(props.draftKey)).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});
it("retains each schedule's retry identity when returning from another date selection", async () => {
  const first = render(<RequestForm {...props} />); await fillDraft();
  const id = operation(first.container); first.unmount();
  const changed = render(<RequestForm {...props} schedule={{ ...props.schedule, returnDate: "2099-08-27" }} />);
  expect(operation(changed.container)).not.toBe(id); changed.unmount();
  const restored = render(<RequestForm {...props} />);
  expect(operation(restored.container)).toBe(id);
});
it("ignores malformed and expired drafts without blocking the form", () => {
  sessionStorage.setItem(props.draftKey, JSON.stringify({ savedAt: Date.now(), value: { values: { intendedUse: { unexpected: true } } } }));
  const first = render(<RequestForm {...props} />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe(""); first.unmount();
  const stored = JSON.parse(sessionStorage.getItem(props.draftKey)!);
  stored.savedAt = Date.now() - 86_400_001; stored.value.values.intendedUse = "Expired";
  sessionStorage.setItem(props.draftKey, JSON.stringify(stored));
  render(<RequestForm {...props} />);
  expect((screen.getByRole("textbox", { name: "Purpose" }) as HTMLInputElement).value).toBe("");
});
it("retries an uncertain submission with its exact payload after other dates are edited", async () => {
  action.mockResolvedValue({ status: "error", error: "request_failed", retryUnchanged: true });
  const first = render(<RequestForm {...props} />); await fillDraft();
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await screen.findByRole("link", { name: "Check your bookings" });
  const original = Object.fromEntries(action.mock.calls[0][1] as FormData);
  expect((screen.getByRole("button", { name: "Edit your details" }) as HTMLButtonElement).disabled).toBe(true);
  first.unmount();
  const changed = render(<RequestForm {...props} schedule={{ ...props.schedule, returnDate: "2099-08-27" }} />);
  await userEvent.clear(screen.getByRole("textbox", { name: "Purpose" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Purpose" }), "Different date plans"); changed.unmount();
  render(<RequestForm {...props} meetupPlaces={[{ ...testMeetupPlace, version: 2 }]} />);
  expect(screen.getByRole("heading", { name: "Review" })).toBeTruthy();
  expect(screen.getByText("Portrait practice", { selector: "dd" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  const retry = Object.fromEntries(action.mock.calls[1][1] as FormData);
  for (const field of ["operationId", "meetupPlaceId", "meetupPlaceVersion", "intendedUse", "expectedLocation", "pickupDate", "returnDate"]) expect(retry[field]).toBe(original[field]);
});

it("remains usable when tab storage is unavailable", async () => {
  vi.spyOn(storagePrototype, "getItem").mockImplementation(() => { throw new Error("storage blocked"); });
  vi.spyOn(storagePrototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
  render(<RequestForm {...props} />); await fillDraft();
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  expect(screen.getByRole("button", { name: "Submit rental request" })).toBeTruthy();
});
it("does not unlock an uncertain request after a later authentication or profile outage", async () => {
  action.mockResolvedValueOnce({ status: "error", error: "request_failed", retryUnchanged: true })
    .mockResolvedValue({ status: "error", error: "request_failed" });
  render(<RequestForm {...props} />); await fillDraft();
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await screen.findByRole("link", { name: "Check your bookings" });
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect((screen.getByRole("button", { name: "Edit your details" }) as HTMLButtonElement).disabled).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(props.draftKey)!).value.submitted).toBe(true);
});
it("keeps the original retry UUID when only the shared draft can be persisted", async () => {
  const setItem = storagePrototype.setItem;
  vi.spyOn(storagePrototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key.includes(":operation:")) throw new Error("quota exceeded");
    return setItem.call(this, key, value);
  });
  action.mockResolvedValue({ status: "error", error: "request_failed", retryUnchanged: true });
  const first = render(<RequestForm {...props} />); await fillDraft();
  const original = operation(first.container);
  await userEvent.click(screen.getByRole("button", { name: "Review rental request" }));
  await userEvent.click(screen.getByRole("button", { name: "Submit rental request" }));
  await screen.findByRole("link", { name: "Check your bookings" });
  expect(Object.keys(sessionStorage).filter(key => key.includes(":operation:"))).toEqual([]);
  first.unmount();
  const retry = render(<RequestForm {...props} />);
  expect(operation(retry.container)).toBe(original);
  expect((screen.getByRole("button", { name: "Edit your details" }) as HTMLButtonElement).disabled).toBe(true);
});
