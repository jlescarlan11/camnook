import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadAdminCameraHandoffPolicy,
  loadAdminCameraHandoffSummaries,
} from "./handoff-data";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function context(options?: { policy?: unknown; policyError?: unknown }) {
  const rpc = vi.fn((name: string) => Promise.resolve({
    data: name === "get_camera_handoff_summaries_admin"
      ? [{
          camera_id: CAMERA_ID,
          camera_name: "Canon R50",
          camera_status: "published",
          city_label: "Cebu City",
          enabled: true,
          version: 2,
        }]
      : options?.policy,
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

  it("preserves the database admin denial for the page redirect", async () => {
    await expect(loadAdminCameraHandoffPolicy(context({
      policyError: {
        code: "42501",
        message: "admin authorization required",
      },
    }).context, CAMERA_ID)).resolves.toEqual({ status: "forbidden" });
  });

  it("summarizes configured and legacy cameras without private anchors", async () => {
    const fixture = context();
    const result = await loadAdminCameraHandoffSummaries(fixture.context);

    expect(result).toEqual({
      cameras: [
        {
          cameraId: CAMERA_ID,
          cameraName: "Canon R50",
          cameraStatus: "published",
          cityLabel: "Cebu City",
          enabled: true,
          version: 2,
        },
      ],
      status: "success",
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_camera_handoff_summaries_admin",
    );
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|provider_city/);
  });
});
