import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RequestForm } from "./request-form";

const schedule = {
  handoffTime: "09:00",
  pickupDate: "2099-08-24",
  policyVersion: "3",
  returnDate: "2099-08-26",
};

describe("RequestForm", () => {
  it("collects only renter details needed for review and defers exact meetup selection", () => {
    const markup = renderToStaticMarkup(
      <RequestForm
        camera="11111111-1111-4111-8111-111111111111"
        schedule={schedule}
        summary={{
          cameraName: "Canon R50",
          dates: "Aug 24 – Aug 26",
          handoffTime: "9:00 AM PHT",
          rentalAmount: "₱1,500",
          securityDeposit: "₱3,000",
          totalDue: "₱4,500",
        }}
      />,
    );
    expect(markup).toContain("Your details");
    expect(markup).toContain("Preferred meetup area");
    expect(markup).toContain("exact public meetup location");
    expect(markup).toContain('autoComplete="address-level2"');
    expect(markup).toContain('name="legalName"');
    expect(markup).toContain('name="phone"');
    expect(markup).toContain("Continue to review");
    expect(markup).not.toContain('name="latitude"');
    expect(markup).not.toContain('name="longitude"');
    expect(markup).not.toContain("Geoapify");
  });
});
