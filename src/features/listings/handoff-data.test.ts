import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadAdminCameraHandoffPolicy,
  loadAdminCameraHandoffSummaries,
} from "./handoff-data";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(private readonly result: { data: unknown; error: unknown }) {}
  select() { return this; }
  neq() { return this; }
  order() { return this; }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function context(options?: { policy?: unknown; policyError?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({
    data: options?.policy,
    error: options?.policyError ?? null,
  });
  const from = vi.fn((table: string) =>
    new QueryBuilder(
      table === "cameras"
        ? {
            data: [{ id: CAMERA_ID, name: "Canon R50", status: "published" }],
            error: null,
          }
        : {
            data: [{ camera_id: CAMERA_ID, city_label: "Cebu City", enabled: true, version: 2 }],
            error: null,
          },
    ),
  );
  return {
    context: { supabase: { from, schema: vi.fn(() => ({ rpc })) } } as never,
    from,
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
        countryCode: "PH",
        enabled: true,
        latitude: 10.3157,
        longitude: 123.8854,
        providerCityId: "geoapify:cebu-city",
        timezone: "Asia/Manila",
        version: 2,
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toContain("raw_provider_payload");
  });

  it("fails closed on malformed or missing camera data", async () => {
    await expect(
      loadAdminCameraHandoffPolicy(context({ policy: {} }).context, CAMERA_ID),
    ).resolves.toEqual({ status: "error" });
    await expect(
      loadAdminCameraHandoffPolicy(context().context, "not-a-uuid"),
    ).resolves.toEqual({ status: "missing" });
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
    expect(fixture.from).toHaveBeenCalledWith("camera_handoff_policies");
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|provider_city/);
  });
});
