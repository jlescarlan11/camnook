// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("./residential-pin-picker", () => ({ ResidentialPinPicker: () => <>
  <input name="pinOperation" type="hidden" value="keep" />
  <input name="savedPinPresent" type="hidden" value="1" />
</> }));
vi.mock("@/features/locations/psgc-area-selector", () => ({ PsgcAreaSelector: () => <>
  <input name="psgcAreaCode" type="hidden" value="0722170010" />
  <input name="psgcRelease" type="hidden" value="2026-q2" />
</> }));

import { requireUser } from "@/lib/auth/require-user";
import { KycProfileForm } from "./kyc-profile-form";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("preserves entered KYC details after authorization fails", async () => {
  vi.mocked(requireUser).mockRejectedValue(new Error("Synthetic auth outage"));
  render(<KycProfileForm kyc={null} profile={null} returnTo="/account" />);
  const values = {
    legalName: "Synthetic Renter", birthDate: "1990-01-15", phone: "+639170000000",
    houseNumber: "12", streetName: "Synthetic Street", postalCode: "6000",
  };
  const form = screen.getByLabelText("Full legal name").closest("form")!;
  for (const [name, value] of Object.entries(values)) {
    fireEvent.change(form.elements.namedItem(name) as HTMLInputElement, { target: { value } });
  }
  await userEvent.click(form.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  await screen.findByText("Sign in again to save your details.");
  expect(requireUser).toHaveBeenCalledOnce();
  for (const [name, value] of Object.entries(values)) {
    expect((form.elements.namedItem(name) as HTMLInputElement).value).toBe(
      name === "phone" ? "9170000000" : value,
    );
  }
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "08006" } });
  vi.mocked(requireUser).mockResolvedValue({ supabase: { schema: () => ({ rpc }) }, user: { id: "synthetic-renter" } } as never);
  await userEvent.click(form.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  await screen.findByText("Your KYC details could not be saved. Please retry.");
  expect(rpc).toHaveBeenCalledWith("save_my_kyc_profile_v2", { p_input: expect.objectContaining({
    legal_name: values.legalName, birth_date: values.birthDate, phone: values.phone,
    house_number: values.houseNumber, street_name: values.streetName, postal_code: values.postalCode,
  }) });
});
