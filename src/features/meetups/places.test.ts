import { expect, it } from "vitest";
import { meetupMapUrl } from "./places";
import { safeMeetupPlanRowSchema, projectMeetupPlan } from "./plan";
it("preserves a lender place as a precise snapshot without inventing a renter city", () => {
  const row = {
    booking_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-09-20T00:00:00Z",
    plan_kind: "lender_place",
    renter_city_label: null,
    source_place_id: "44444444-4444-4444-8444-444444444444",
    source_place_version: 2,
    arrival_instructions: "Main entrance",
    venue_name: "Public mall",
    venue_address: "Public road, Cebu",
    venue_city: "Cebu City",
    venue_latitude: 10.315712,
    venue_longitude: 123.885423,
    provider: null,
    provider_config_version: null,
    attribution: null,
  };
  const projected = projectMeetupPlan(safeMeetupPlanRowSchema.parse(row));
  expect(projected).toMatchObject({
    kind: "lender_place",
    latitude: 10.315712,
    longitude: 123.885423,
    arrivalInstructions: "Main entrance",
    renterCity: null,
  });
  expect(
    safeMeetupPlanRowSchema.safeParse({ ...row, source_place_version: null })
      .success,
  ).toBe(false);
});
it("builds directions from coordinates and rejects invalid destinations", () => {
  expect(meetupMapUrl(10.315712, 123.885423, true)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=10.315712%2C123.885423",
  );
  expect(() => meetupMapUrl(NaN, 0)).toThrow();
  expect(() => meetupMapUrl(10, 181)).toThrow();
});
