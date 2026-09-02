import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMeetupRoutingConfig } from "./config";
import { MapboxMatrixAdapter } from "./routing-provider";

const enabled = process.env.RUN_MEETUP_ROUTING_DEVELOPMENT_CHECK === "1";

describe.skipIf(!enabled)("Mapbox Development routing check", () => {
  it("proves bounded Cebu-area reachability without customer coordinates", async () => {
    expect(process.env.VERCEL_ENV).not.toBe("production");
    const config = getMeetupRoutingConfig();
    expect(config).not.toBeNull();
    const result = await new MapboxMatrixAdapter(config!).calculateTravelTimes({
      // Public city/landmark coordinates only. Never replace these fixtures with
      // customer, residential, or browser-derived coordinates.
      ownerOrigin: { latitude: 10.3157, longitude: 123.8854 },
      renterOrigin: { latitude: 10.3236, longitude: 123.9222 },
      targets: [
        { latitude: 10.3172, longitude: 123.9054 },
        { latitude: 10.3308, longitude: 123.9067 },
        { latitude: 10.3103, longitude: 123.9494 },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result.some((route) => route.ownerSeconds !== null)).toBe(true);
    expect(result.some((route) => route.renterSeconds !== null)).toBe(true);
    expect(result.every((route) =>
      route.ownerSeconds === null || route.ownerSeconds >= 0,
    )).toBe(true);
    // The reviewed benchmark consumes exactly two origins × three destinations.
    expect(result.length * 2).toBe(6);
  });
});
