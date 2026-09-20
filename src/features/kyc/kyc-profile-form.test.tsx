import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { KycProfileForm } from "./kyc-profile-form";

describe("KycProfileForm", () => {
  it("collects minimum renter details without SMS OTP or ID upload", () => {
    const markup = renderToStaticMarkup(
      <KycProfileForm
        kyc={null}
        profile={{ legalName: "Maria Santos", phone: "+63 917 123 4567" }}
        returnTo="/account"
      />,
    );
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('name="houseNumber"');
    expect(markup).toContain('name="streetName"');
    expect(markup).toContain('name="building"');
    expect(markup).toContain('name="postalCode"');
    expect(markup).toContain('pattern="[0-9]{4}"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('name="addressDetails"');
    expect(markup).toContain("Add map pin");
    expect(markup).toContain("required for an unnamed road");
    expect(markup).toContain('name="psgcAreaCode"');
    expect(markup).toContain("No SMS or ID upload");
    expect(markup).not.toContain('type="file"');
  });
});
