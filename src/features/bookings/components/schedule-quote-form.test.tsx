import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ScheduleQuoteForm } from "./schedule-quote-form";

const policy = {
  allowedWeekdays: [1, 2, 3, 4, 5],
  approximationLevel: "barangay_centroid" as const,
  approvedTimes: ["09:00", "17:00"],
  cityLabel: "Cebu City",
  enabled: true,
  timezone: "Asia/Manila" as const,
  version: 3,
};

describe("ScheduleQuoteForm", () => {
  it("fails closed without a usable policy and offers no arbitrary datetime inputs", () => {
    const markup = renderToStaticMarkup(
      <ScheduleQuoteForm
        availability={[]}
        cameraId="11111111-1111-4111-8111-111111111111"
        cameraName="Canon R50"
        policy={null}
      />,
    );

    expect(markup).toContain("Scheduling unavailable");
    expect(markup).not.toContain('type="datetime-local"');
    expect(markup).not.toContain("Get authoritative quote");
  });

  it("renders an accessible calendar, approved slots, key, and non-reservation copy", () => {
    const markup = renderToStaticMarkup(
      <ScheduleQuoteForm
        availability={[
          {
            endsAt: "2099-08-25T09:00:00+08:00",
            startsAt: "2099-08-24T09:00:00+08:00",
          },
        ]}
        cameraId="11111111-1111-4111-8111-111111111111"
        cameraName="Canon R50"
        policy={policy}
      />,
    );

    expect(markup).toContain("Choose rental dates");
    expect(markup).toContain("Handoff time — Asia/Manila");
    expect(markup).toContain("9:00 AM");
    expect(markup).toContain("5:00 PM");
    expect(markup).toContain("Availability key");
    expect(markup).toContain("cannot be a handoff endpoint");
    expect(markup).toContain(
      "Dimmed no-handoff days may remain inside a valid rental range.",
    );
    expect(markup).toContain("does not reserve the camera");
    expect(markup).toContain("Meetup area");
    expect(markup).toContain("barangay-level approximation");
    expect(markup).toContain('aria-label="Show next month"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('type="datetime-local"');
  });
});
