import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadAdminCameraHandoffPolicy } from "./handoff-data";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function context(options?: { policy?: unknown; policyError?: unknown }) {
  const rpc = vi.fn(() => Promise.resolve({
    data: options?.policy,
    error: options?.policyError ?? null,
  }));
  return {
    context: { supabase: { schema: vi.fn(() => ({ rpc })) } } as never,
    rpc,
  };
}

describe("camera handoff admin data", () => {
  it("normalizes the private admin RPC without widening its DTO", async () => {
    const fixture = context({
      policy: {
        allowed_weekdays: [1, 3, 5],
        approved_times: ["09:00", "17:00"],
        camera_id: CAMERA_ID,
        camera_name: "Canon R50",
        camera_status: "published",
        city_label: "Cebu City",
        country_code: "PH",
        enabled: true,
        latitude: "10.31570",
        longitude: "123.88540",
        provider_city_id: "geoapify:cebu-city",
        raw_provider_payload: "must not survive",
        timezone: "Asia/Manila",
        version: 2,
      },
    });

    const result = await loadAdminCameraHandoffPolicy(
      fixture.context,
      CAMERA_ID,
    );
    expect(result).toEqual({
      policy: {
        allowedWeekdays: [1, 3, 5],
        approvedTimes: ["09:00", "17:00"],
        cameraId: CAMERA_ID,
        cameraName: "Canon R50",
        cameraStatus: "published",
        cityLabel: "Cebu City",
        enabled: true,
        timezone: "Asia/Manila",
        version: 2,
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toContain("raw_provider_payload");
    expect(JSON.stringify(result)).not.toMatch(
      /providerCityId|latitude|longitude|geoapify:cebu-city/,
    );
  });

  it("fails closed on malformed or missing camera data", async () => {
    await expect(
      loadAdminCameraHandoffPolicy(context({ policy: {} }).context, CAMERA_ID),
    ).resolves.toEqual({ status: "error" });
    await expect(
      loadAdminCameraHandoffPolicy(context().context, "not-a-uuid"),
    ).resolves.toEqual({ status: "missing" });
  });

  it("preserves canonical release validity for the admin review state", async () => {
    const fixture = context({
      policy: {
        allowed_weekdays: [1],
        approved_times: ["09:00"],
        camera_id: CAMERA_ID,
        camera_name: "Canon R50",
        camera_status: "published",
        canonical_anchor: {
          active: true,
          area_code: "0730600041",
          area_name: "Lahug",
          area_path: [
            { code: "0700000000", name: "Central Visayas", type: "region" },
            { code: "0730600000", name: "City of Cebu", type: "city" },
            { code: "0730600041", name: "Lahug", type: "barangay" },
          ],
          current: false,
          precision: "barangay_centroid",
          release: "2026-q2",
        },
        city_label: "Lahug",
        country_code: "PH",
        enabled: true,
        latitude: "10.33300",
        longitude: "123.89700",
        provider_city_id: "provider:lahug",
        timezone: "Asia/Manila",
        version: 2,
      },
    });

    await expect(loadAdminCameraHandoffPolicy(fixture.context, CAMERA_ID)).resolves.toMatchObject({
      policy: {
        canonicalAnchor: { active: true, current: false },
      },
      status: "success",
    });
  });

  it("preserves the database admin denial for the page redirect", async () => {
    await expect(loadAdminCameraHandoffPolicy(context({
      policyError: {
        code: "42501",
        message: "admin authorization required",
      },
    }).context, CAMERA_ID)).resolves.toEqual({ status: "forbidden" });
  });

});
