import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recommendationState = vi.hoisted(() => ({
  error: undefined as
    | "configuration"
    | "no_eligible_places"
    | "provider_unavailable"
    | "rate_limited"
    | undefined,
  recommendations: [
    {
      address: "Cardinal Rosales Avenue, Cebu City",
      attribution: "© OpenStreetMap contributors · Powered by Geoapify" as const,
      city: "Cebu City",
      configVersion: "geoapify-v1",
      expiresAt: "2099-08-24T00:00:00.000Z",
      latitude: 10.317,
      longitude: 123.905,
      name: "Ayala Center Cebu",
      ownerCity: "Cebu City",
      ownerTravelMinutes: 12 as number | null,
      routeEstimateApproximate: false,
      routeMode: "balanced" as "balanced" | "geoapify_fallback",
      renterCity: "Mandaue City",
      renterTravelMinutes: 14 as number | null,
      reference: "v2.first-opaque-reference",
    },
    {
      address: "North Reclamation Area, Mandaue City",
      attribution: "© OpenStreetMap contributors · Powered by Geoapify" as const,
      city: "Mandaue City",
      configVersion: "geoapify-v1",
      expiresAt: "2099-08-24T00:00:00.000Z",
      latitude: 10.326,
      longitude: 123.932,
      name: "Parkmall",
      ownerCity: "Cebu City",
      ownerTravelMinutes: 15 as number | null,
      routeEstimateApproximate: false,
      routeMode: "balanced" as "balanced" | "geoapify_fallback",
      renterCity: "Mandaue City",
      renterTravelMinutes: 10 as number | null,
      reference: "v2.second-opaque-reference",
    },
  ],
  status: "success" as const,
  warning: undefined as
    | "configuration"
    | "no_eligible_places"
    | "provider_unavailable"
    | "rate_limited"
    | undefined,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: vi.fn(
      (action: { name?: string }, initialState: unknown) =>
        action.name === "recommendMeetup"
          ? [recommendationState, vi.fn(), false]
          : [initialState, vi.fn(), false],
    ),
  };
});

import { renderToStaticMarkup } from "react-dom/server";

import { recommendationBatchKey, RequestForm } from "./request-form";

const schedule = {
  handoffTime: "09:00",
  pickupDate: "2099-08-24",
  policyVersion: "3",
  returnDate: "2099-08-26",
};

function renderForm() {
  return renderToStaticMarkup(
    <RequestForm
      camera="11111111-1111-4111-8111-111111111111"
      pickup=""
      returnValue=""
      schedule={schedule}
    />,
  );
}

describe("RequestForm rendered meetup options", () => {
  beforeEach(() => {
    recommendationState.error = undefined;
    recommendationState.warning = undefined;
    recommendationState.recommendations.forEach((recommendation, index) => {
      recommendation.ownerTravelMinutes = index === 0 ? 12 : 15;
      recommendation.renterTravelMinutes = index === 0 ? 14 : 10;
      recommendation.routeEstimateApproximate = false;
      recommendation.routeMode = "balanced";
    });
  });

  it("identifies the complete recommendation batch for origin invalidation", () => {
    const current = recommendationBatchKey(recommendationState.recommendations);
    expect(current).toContain("v2.first-opaque-reference");
    expect(recommendationBatchKey([{ reference: "v2.new-reference" }])).not.toBe(
      current,
    );
  });

  it("renders labeled single-choice options, advisory times, and public-place limits", () => {
    const markup = renderForm();

    expect(markup).toContain("<fieldset");
    expect(markup).toContain("<legend");
    expect(markup.match(/type="radio"/g)).toHaveLength(2);
    expect(markup.match(/name="meetupOption"/g)).toHaveLength(2);
    expect(markup).toContain("Owner handoff origin: <strong>Cebu City</strong>");
    expect(markup).toContain("Ayala Center Cebu");
    expect(markup).toContain("14 min from you · 12 min from owner");
    expect(markup).toContain("malls, fast-food restaurants, universities, and police stations");
    expect(markup).toContain("Crowd levels and safety are not verified live");
    expect(markup).toContain("staffed, visible area");
    expect(markup).toContain("Powered by Geoapify");
    expect(markup).toContain("sm:flex-row");
    expect(markup).toContain("sm:w-auto");
    expect(markup).not.toContain("10.317");
    expect(markup).not.toContain("providerCityId");
  });

  it("renders the no-time fallback without a route-ranked claim", () => {
    recommendationState.recommendations.forEach((recommendation) => {
      recommendation.ownerTravelMinutes = null;
      recommendation.renterTravelMinutes = null;
      recommendation.routeMode = "geoapify_fallback";
    });

    const markup = renderForm();
    expect(markup).toContain("without travel-time claims");
    expect(markup.match(/Travel times unavailable; this option is not route-ranked\./g)).toHaveLength(2);
    expect(markup).not.toContain("min from you");
  });

  it.each([
    ["configuration", "Public venue suggestions are not configured right now."],
    ["rate_limited", "Place suggestions are busy right now."],
    ["no_eligible_places", "No reviewed public venues were found for this area."],
    ["provider_unavailable", "The place provider could not be reached."],
  ] as const)("explains the safe %s failure", (error, message) => {
    recommendationState.error = error;
    expect(renderForm()).toContain(message);
  });

  it("renders only three of five cards before an accessible reveal control", () => {
    const original = [...recommendationState.recommendations];
    for (let index = 3; index <= 5; index += 1) {
      recommendationState.recommendations.push({
        ...original[0],
        name: `Venue ${index}`,
        reference: `v2.opaque-reference-${index}`,
      });
    }
    const markup = renderForm();
    expect(markup.match(/type="radio"/g)).toHaveLength(3);
    expect(markup).toContain('aria-controls="additional-meetup-options"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Show 2 more");
    expect(markup).not.toContain("Venue 4");
    recommendationState.recommendations.splice(0, recommendationState.recommendations.length, ...original);
  });
});
