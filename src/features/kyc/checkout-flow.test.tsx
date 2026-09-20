// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ saveKycProfile: vi.fn() }));
vi.mock("./residential-pin-picker", () => ({ ResidentialPinPicker: () => <input name="pinOperation" type="hidden" value="keep" /> }));
vi.mock("@/features/locations/psgc-area-selector", () => ({
  PsgcAreaSelector: () => <label>Barangay<input name="psgcAreaCode" defaultValue="0702200001" /></label>,
}));

import { saveKycProfile } from "./actions";
import { KycProfileForm } from "./kyc-profile-form";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveKycProfile).mockResolvedValue({ status: "error", error: "save" });
});

function setup() {
  render(<KycProfileForm checkout kyc={null} profile={null} returnTo="/checkout?camera=test&policyVersion=2" />);
}

async function fillDetails() {
  await userEvent.type(screen.getByLabelText("Full legal name"), "Test Renter");
  fireEvent.change(screen.getByLabelText("Birthdate"), { target: { value: "1995-01-15" } });
  await userEvent.type(screen.getByLabelText("Mobile number"), "+639170000000");
}

it("validates details before changing steps and never saves on the first continue", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy();
  expect(saveKycProfile).not.toHaveBeenCalled();
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect(screen.getByRole("heading", { name: "Your address" })).toBe(document.activeElement);
  expect(saveKycProfile).not.toHaveBeenCalled();
});

it("preserves both steps on back navigation and submits all fields with the original return URL", async () => {
  setup();
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await userEvent.type(screen.getByLabelText("Street name (optional)"), "Test Street");
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("Test Renter");
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect((screen.getByLabelText("Street name (optional)") as HTMLInputElement).value).toBe("Test Street");
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  await waitFor(() => expect(saveKycProfile).toHaveBeenCalledTimes(1));
  const data = vi.mocked(saveKycProfile).mock.calls[0][1];
  expect(data.get("legalName")).toBe("Test Renter");
  expect(data.get("birthDate")).toBe("1995-01-15");
  expect(data.get("streetName")).toBe("Test Street");
  expect(data.get("returnTo")).toBe("/checkout?camera=test&policyVersion=2");
  expect((await screen.findByRole("alert")).textContent).toContain("could not be saved");
});

it("returns to the Details step when server validation rejects a personal field", async () => {
  vi.mocked(saveKycProfile).mockResolvedValue({ status: "error", error: "invalid", fieldErrors: { phone: "Check your mobile number." } });
  setup();
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Your details" })).toBeTruthy());
  expect(screen.getByText("Check your mobile number.").closest("[hidden]")).toBeNull();
});
