import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { KycProfileForm } from "./kyc-profile-form";

describe("KycProfileForm", () => {
  it.each([
    ["2026-09-21T15:59:59Z", "2008-09-21"],
    ["2026-09-21T16:00:00Z", "2008-09-22"],
    ["2028-02-29T08:00:00Z", "2010-02-28"],
  ])("uses the Manila adult cutoff at %s", (instant, cutoff) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    try {
      const markup = renderToStaticMarkup(<KycProfileForm kyc={null} profile={null} returnTo="/account" />);
      expect(markup).toContain(`max="${cutoff}"`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("collects minimum renter details without SMS OTP or ID upload", () => {
    const markup = renderToStaticMarkup(
      <KycProfileForm
        kyc={null}
        profile={{ legalName: "Maria Santos", phone: "+63 917 123 4567" }}
        returnTo="/account"
      />,
    );
    expect(markup).toContain('name="birthDate"');
    expect(markup).toContain('+63');
    expect(markup).toContain('value="9171234567"');
    expect(markup).toContain('name="houseNumber"');
    expect(markup).toContain('name="streetName"');
    expect(markup).toContain('name="building"');
    expect(markup).toContain('name="postalCode"');
    expect(markup).toContain('pattern="[0-9]{4}"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('name="addressDetails"');
    expect(markup).toContain("Confirm this pin");
    expect(markup).toContain("Residential map pin");
    expect(markup).toContain("(required)");
    expect(markup).not.toMatch(/Residential map pin.*\(optional\)/);
    expect(markup).toContain('name="psgcAreaCode"');
    expect(markup).toContain("No SMS or ID upload");
    expect(markup).not.toContain('type="file"');
    expect(markup).toMatch(/<a[^>]*target="_blank"[^>]*>Privacy details \(opens in a new tab\)<\/a>/);
    expect(markup).toContain('rel="noopener noreferrer"');
  });
});
