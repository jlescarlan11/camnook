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
          countryCode: "PH",
          enabled: true,
          latitude: 10.3157,
          longitude: 123.8854,
          providerCityId: "geoapify:cebu-city",
          timezone: "Asia/Manila",
          version: 2,
        }}
      />,
    );

    expect(markup).toContain("Customer-facing city");
    expect(markup).toContain("Philippine-time handoffs");
    expect(markup).toContain("Asia/Manila (UTC+08:00)");
    expect(markup).toContain("Save handoff policy");
    expect(markup).toContain('name="expectedVersion" value="2"');
    expect(markup).toContain('name="weekdays"');
    expect(markup).toContain('aria-describedby="city-label-help"');
  });
});
