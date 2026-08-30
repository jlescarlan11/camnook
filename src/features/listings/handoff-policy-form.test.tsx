import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./handoff-actions", () => ({
  saveCameraHandoffPolicy: vi.fn(),
  suggestHandoffAddress: vi.fn(),
  suggestHandoffCity: vi.fn(),
}));

import {
  HandoffPolicyForm,
  resetAddressLookupRequest,
} from "./handoff-policy-form";

describe("HandoffPolicyForm", () => {
  it("renders associated admin fields, PHT guidance, and an accessible save control", () => {
    const markup = renderToStaticMarkup(
      <HandoffPolicyForm
        policy={{
          allowedWeekdays: [1, 3],
          approvedTimes: ["09:00", "17:00"],
          cameraId: "11111111-1111-4111-8111-111111111111",
          cameraName: "Canon R50",
          cameraStatus: "published",
          cityLabel: "Cebu City",
          enabled: true,
          timezone: "Asia/Manila",
          version: 2,
        }}
      />,
    );

    expect(markup).toContain("Customer-facing city");
    expect(markup).toContain("Saved handoff city");
    expect(markup).toContain("Auto-suggest a public address");
    expect(markup).toContain("Public place or address");
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Use my current city");
    expect(markup).toContain("Enter a city instead");
    expect(markup).toContain("Philippine-time handoffs");
    expect(markup).toContain("Asia/Manila (UTC+08:00)");
    expect(markup).toContain("Save handoff policy");
    expect(markup).toContain('name="expectedVersion" value="2"');
    expect(markup).toContain('name="weekdays"');
    expect(markup).toContain('autoComplete="address-level2"');
    expect(markup).not.toContain('name="providerCityId"');
    expect(markup).not.toContain('name="latitude"');
    expect(markup).not.toContain('name="longitude"');
  });

  it("does not request browser location while rendering a legacy policy", () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const markup = renderToStaticMarkup(
      <HandoffPolicyForm
        policy={{
          allowedWeekdays: [],
          approvedTimes: [],
          cameraId: "11111111-1111-4111-8111-111111111111",
          cameraName: "Legacy Camera",
          cameraStatus: "published",
          cityLabel: "",
          enabled: false,
          timezone: "Asia/Manila",
          version: 0,
        }}
      />,
    );

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(markup).toContain("No handoff city is saved");
    expect(markup).toContain('name="cityReference"');
    expect(markup).toContain('disabled=""');
    expect(markup).toMatch(/Save handoff policy<\/button>/);
    vi.unstubAllGlobals();
  });

  it("allows a previously searched address to be searched again after editing", () => {
    expect(resetAddressLookupRequest("Ayala Center Cebu", "Cebu IT Park")).toBe(
      "",
    );
    expect(resetAddressLookupRequest("Cebu IT Park", "Ayala Center Cebu")).toBe(
      "",
    );
    expect(resetAddressLookupRequest("Ayala Center Cebu", " Ayala Center Cebu ")).toBe(
      "Ayala Center Cebu",
    );
  });
});
