import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("../provider-budget", () => ({ claimGeoapifyProviderBudget: vi.fn() }));

import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { claimGeoapifyProviderBudget } from "../provider-budget";
import { recommendMeetup } from "./recommend-meetup";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function mcp(structuredContent: unknown) {
  return new Response(
    JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      result: { isError: false, structuredContent },
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

function validSchedule(extra: Record<string, string> = {}) {
  return fields({
    accuracy: "20",
    camera: CAMERA_ID,
    handoffTime: "09:00",
    latitude: "10.30123456",
    locationMode: "current",
    longitude: "123.90123456",
    pickupDate: "2099-08-24",
    policyVersion: "3",
    returnDate: "2099-08-26",
    ...extra,
  });
}

describe("recommendMeetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-meetup-reference-secret-value";
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: { id: "renter-1" },
    } as never);
    vi.mocked(claimGeoapifyProviderBudget).mockResolvedValue(true);
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: {
            camera_id: CAMERA_ID,
            city_label: "Cebu City",
            country_code: "PH",
            latitude: 10.3157,
            longitude: 123.8854,
            policy_version: 3,
            provider_city_id: "provider:cebu",
          },
          error: null,
        }),
      })),
    } as never);
  });

  it("derives one safe recommendation without returning or logging the precise browser position", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        mcp({
          results: [
            {
              city: "Mandaue City",
              country_code: "ph",
              lat: 10.3236,
              lon: 123.9222,
              place_id: "provider:mandaue",
              result_type: "city",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        mcp({
          results: [
            {
              categories: ["commercial.shopping_mall"],
              city: "Cebu City",
              formatted: "Cardinal Rosales Avenue, Cebu City",
              lat: 10.3172,
              lon: 123.9054,
              name: "Ayala Center Cebu",
              place_id: "provider:ayala",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", request);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await recommendMeetup({ status: "idle" }, validSchedule());

    expect(result).toMatchObject({
      recommendation: {
        address: "Cardinal Rosales Avenue, Cebu City",
        name: "Ayala Center Cebu",
        renterCity: "Mandaue City",
        reference: expect.stringMatching(/^v1\./),
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toMatch(/10\.30123456|123\.90123456|provider:ayala|provider:mandaue/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/10\.|123\.|Ayala|Mandaue|reference/);
    expect(String(request.mock.calls[0]?.[0])).not.toMatch(/10\.30123456|123\.90123456/);
  });

  it("accepts only provider-validated Philippine city-level manual fallback", async () => {
    await expect(
      recommendMeetup(
        { status: "idle" },
        validSchedule({ locationMode: "manual", manualCity: "123 Main Street" }),
      ),
    ).resolves.toEqual({ error: "invalid_city", status: "error" });

    const request = vi.fn().mockResolvedValue(
      mcp({
        results: [
          {
            city: "Singapore",
            country_code: "sg",
            lat: 1.29,
            lon: 103.85,
            result_type: "city",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", request);
    await expect(
      recommendMeetup(
        { status: "idle" },
        validSchedule({ locationMode: "manual", manualCity: "Singapore" }),
      ),
    ).resolves.toEqual({ error: "invalid_city", status: "error" });
  });

  it("rejects inaccurate positions and stale schedule context with constrained errors", async () => {
    await expect(
      recommendMeetup(
        { status: "idle" },
        validSchedule({ accuracy: "50001" }),
      ),
    ).resolves.toEqual({ error: "invalid_location", status: "error" });

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "40001", message: "private policy detail" },
        }),
      })),
    } as never);
    const stale = await recommendMeetup({ status: "idle" }, validSchedule());
    expect(stale).toEqual({ error: "schedule_changed", status: "error" });
    expect(JSON.stringify(stale)).not.toContain("private policy");
  });

  it("does not call Geoapify when the bounded request budget is unavailable", async () => {
    vi.mocked(claimGeoapifyProviderBudget).mockResolvedValue(false);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(
      recommendMeetup({ status: "idle" }, validSchedule()),
    ).resolves.toEqual({ error: "provider_unavailable", status: "error" });
    await expect(
      recommendMeetup(
        { status: "idle" },
        validSchedule({ locationMode: "manual", manualCity: "Mandaue City" }),
      ),
    ).resolves.toEqual({ error: "provider_unavailable", status: "error" });
    expect(request).not.toHaveBeenCalled();
  });
});
