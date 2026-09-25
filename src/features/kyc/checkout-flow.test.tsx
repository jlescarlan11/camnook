// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ saveKycProfile: vi.fn() }));
vi.mock("./residential-pin-picker", () => ({ ResidentialPinPicker: () => <input name="pinOperation" type="hidden" value="keep" /> }));
vi.mock("@/features/locations/psgc-area-selector", () => ({
  PsgcAreaSelector: ({ errorId, invalid }: { errorId?: string; invalid?: boolean }) => <fieldset aria-describedby={errorId} aria-invalid={invalid ? true : undefined}><legend>Philippine address</legend><label>Barangay<input name="psgcAreaCode" defaultValue="0702200001" /></label></fieldset>,
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
  await userEvent.type(screen.getByLabelText("Mobile number"), "9170000000");
}

async function fillAddress() {
  await userEvent.type(screen.getByLabelText(/^House or lot number/), "12");
  await userEvent.type(screen.getByLabelText(/^Street name/), "Test Street");
  await userEvent.type(screen.getByLabelText("Postal code"), "6000");
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
  await fillAddress();
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("Test Renter");
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect((screen.getByLabelText(/^Street name/) as HTMLInputElement).value).toBe("Test Street");
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
  await fillAddress();
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  const error = await screen.findByText("Check your mobile number.");
  const phone = screen.getByLabelText("Mobile number");
  expect(error.closest("[hidden]")).toBeNull();
  expect(phone.getAttribute("aria-invalid")).toBe("true");
  expect(phone.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("identifies the address selection group when server validation rejects its area", async () => {
  vi.mocked(saveKycProfile).mockResolvedValue({ status: "error", error: "invalid", fieldErrors: { psgcAreaCode: "Choose a current Philippine address." } });
  setup();
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await fillAddress();
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  const error = await screen.findByText("Choose a current Philippine address.");
  const area = screen.getByRole("group", { name: "Philippine address" });
  expect(area.getAttribute("aria-invalid")).toBe("true");
  expect(area.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("restores details and address after leaving checkout, isolated by account and saved revision", async () => {
  sessionStorage.clear();
  const props = { checkout: true, kyc: null, profile: null, returnTo: "/checkout?camera=test", draftKey: "checkout:renter-a:new" };
  const first = render(<KycProfileForm {...props} />);
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await fillAddress();
  first.unmount();
  const second = render(<KycProfileForm {...props} returnTo="/checkout?camera=test&pickupDate=2026-10-01" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("Test Renter");
  expect((screen.getByLabelText("Birthdate") as HTMLInputElement).value).toBe("1995-01-15");
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect((screen.getByLabelText(/^Street name/) as HTMLInputElement).value).toBe("Test Street");
  expect((screen.getByLabelText("Postal code") as HTMLInputElement).value).toBe("6000");
  second.unmount();
  const other = render(<KycProfileForm {...props} draftKey="checkout:renter-b:new" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("");
  other.unmount();
  render(<KycProfileForm {...props} draftKey="checkout:renter-a:saved-revision" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("");
  sessionStorage.clear();
});

it("keeps personal and address fields through a lost save response and explicit retry", async () => {
  vi.mocked(saveKycProfile).mockRejectedValueOnce(new Error("Synthetic connection failure"));
  setup();
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await fillAddress();
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  await screen.findByText("The saved outcome could not be confirmed. Reload to check your details before retrying.");
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("Test Renter");
  expect((screen.getByLabelText(/^Street name/) as HTMLInputElement).value).toBe("Test Street");
  expect((screen.getByLabelText("Postal code") as HTMLInputElement).value).toBe("6000");
  await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
  await waitFor(() => expect(saveKycProfile).toHaveBeenCalledTimes(2));
  expect(Object.fromEntries(vi.mocked(saveKycProfile).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(saveKycProfile).mock.calls[0][1]));
});

it("passes a successful save redirect back to Next instead of displaying a save failure", async () => {
  const caught = vi.fn();
  class NavigationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: Error) { caught(error); }
    render() { return this.state.failed ? <p>Framework navigation</p> : this.props.children; }
  }
  vi.mocked(saveKycProfile).mockImplementation(async () => redirect("/checkout"));
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<NavigationBoundary><KycProfileForm checkout kyc={null} profile={null} returnTo="/checkout" /></NavigationBoundary>);
    await fillDetails();
    await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
    await fillAddress();
    await userEvent.click(screen.getByRole("button", { name: "Save and continue to review" }));
    await screen.findByText("Framework navigation");
    expect(caught).toHaveBeenCalledOnce();
    expect(caught.mock.calls[0][0]).toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;") });
    expect(screen.queryByText("The saved outcome could not be confirmed. Reload to check your details before retrying.")).toBeNull();
  } finally {
    diagnostic.mockRestore();
  }
});

it("restores details and address after leaving checkout, isolated by account and saved revision", async () => {
  sessionStorage.clear();
  const props = { checkout: true, kyc: null, profile: null, returnTo: "/checkout?camera=test", draftKey: "checkout:renter-a:new" };
  const first = render(<KycProfileForm {...props} />);
  await fillDetails();
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  await fillAddress();
  first.unmount();
  const second = render(<KycProfileForm {...props} returnTo="/checkout?camera=test&pickupDate=2026-10-01" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("Test Renter");
  expect((screen.getByLabelText("Birthdate") as HTMLInputElement).value).toBe("1995-01-15");
  await userEvent.click(screen.getByRole("button", { name: "Continue to address" }));
  expect((screen.getByLabelText(/^Street name/) as HTMLInputElement).value).toBe("Test Street");
  expect((screen.getByLabelText("Postal code") as HTMLInputElement).value).toBe("6000");
  second.unmount();
  const other = render(<KycProfileForm {...props} draftKey="checkout:renter-b:new" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("");
  other.unmount();
  render(<KycProfileForm {...props} draftKey="checkout:renter-a:saved-revision" />);
  expect((screen.getByLabelText("Full legal name") as HTMLInputElement).value).toBe("");
  sessionStorage.clear();
});
