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
    expect(markup).toContain('name="addressLine1"');
    expect(markup).toContain('name="psgcAreaCode"');
    expect(markup).toContain("SMS verification is not required");
    expect(markup).toContain("do not store its image or number");
    expect(markup).not.toContain('type="file"');
  });
});
