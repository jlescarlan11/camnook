import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./handoff-actions", () => ({
  saveCameraHandoffPolicy: vi.fn(),
}));

import { HandoffPolicyForm } from "./handoff-policy-form";

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

    expect(markup).toContain("Pickup area");
    expect(markup).toContain("Saved area: Cebu City");
    expect(markup).not.toContain("Legacy routing city");
    expect(markup).not.toContain("Public place or address");
    expect(markup).toContain("Available days and times");
    expect(markup).toContain("Asia/Manila (UTC+08:00)");
    expect(markup).toContain("Save availability");
    expect(markup).toContain('name="expectedVersion" value="2"');
    expect(markup).toContain('name="weekdays"');
    expect(markup).not.toContain('autoComplete="address-level2"');
    expect(markup).not.toContain('name="providerCityId"');
    expect(markup).not.toContain('name="latitude"');
    expect(markup).not.toContain('name="longitude"');
    expect(markup).not.toContain("Origin precision");
    expect(markup).not.toContain("Private device position");
    expect(markup).toMatch(/disabled="" type="submit">Save availability/);
  });

  it("requires a private routing origin when no location is configured", () => {
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
    expect(markup).toContain("Pickup area");
    expect(markup).not.toContain('name="cityReference"');
    expect(markup).toContain('disabled=""');
    expect(markup).toMatch(/Save availability<\/button>/);
    vi.unstubAllGlobals();
  });

  it("keeps an existing precise anchor server-side for schedule-only saves", () => {
    const markup = renderToStaticMarkup(
      <HandoffPolicyForm
        policy={{
          allowedWeekdays: [1],
          approvedTimes: ["09:00"],
          cameraId: "11111111-1111-4111-8111-111111111111",
          cameraName: "Canonical Camera",
          cameraStatus: "published",
          canonicalAnchor: {
            active: true,
            areaCode: "0730600041",
            areaName: "Lahug",
            areaPath: [
              { code: "0700000000", name: "Central Visayas", type: "region" },
              { code: "0730600000", name: "City of Cebu", type: "city" },
              { code: "0730600041", name: "Lahug", type: "barangay" },
            ],
            current: true,
            precision: "precise",
            release: "2026-q2",
          },
          cityLabel: "Lahug",
          enabled: true,
          timezone: "Asia/Manila",
          version: 2,
        }}
      />,
    );

    expect(markup).toContain('name="preservedPsgcAreaCode"');
    expect(markup).not.toContain('name="psgcAreaCode"');
    expect(markup).not.toContain('name="originPrecision"');
    expect(markup).not.toContain("Origin precision");
    expect(markup).not.toContain("Use device position");
    expect(markup).not.toContain("Legacy routing city");
    expect(markup).not.toContain("Public place or address");
    expect(markup).toContain("Save availability");
  });

});
