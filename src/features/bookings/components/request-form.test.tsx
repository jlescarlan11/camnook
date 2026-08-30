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

describe("RequestForm meetup planning", () => {
  it("does not request browser location on render and blocks submission before confirmation", () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
    });

    const markup = renderToStaticMarkup(
      <RequestForm
        camera="11111111-1111-4111-8111-111111111111"
        pickup=""
        returnValue=""
        schedule={schedule}
      />,
    );

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(markup).toContain("Use my current city");
    expect(markup).toContain("City or municipality fallback");
    expect(markup).toContain('autoComplete="address-level2"');
    expect(markup).toContain('name="meetupReference"');
    expect(markup).toMatch(/Submit booking request<\/button>/);
    expect(markup).not.toContain('name="latitude"');
    expect(markup).not.toContain('name="longitude"');
    vi.unstubAllGlobals();
  });
});
