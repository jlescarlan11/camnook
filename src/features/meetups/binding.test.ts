import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildMeetupBinding } from "./binding";

const input = {
  cameraId: "11111111-1111-4111-8111-111111111111",
  configVersion: "geoapify-v1",
  handoffTime: "09:00",
  pickupDate: "2099-08-24",
  policyVersion: 3,
  renterId: "22222222-2222-4222-8222-222222222222",
  returnDate: "2099-08-26",
  routingPolicyVersion: "mapbox-matrix-v1",
};

describe("meetup recommendation binding", () => {
  it("is stable for the same request and changes for every protected context", () => {
    const original = buildMeetupBinding(input);

    expect(buildMeetupBinding(input)).toBe(original);
    for (const changed of [
      { cameraId: "33333333-3333-4333-8333-333333333333" },
      { configVersion: "geoapify-v2" },
      { handoffTime: "10:00" },
      { pickupDate: "2099-08-25" },
      { policyVersion: 4 },
      { renterId: "44444444-4444-4444-8444-444444444444" },
      { returnDate: "2099-08-27" },
      { routingPolicyVersion: "mapbox-matrix-v2" },
    ]) {
      expect(buildMeetupBinding({ ...input, ...changed })).not.toBe(original);
    }
  });
});
