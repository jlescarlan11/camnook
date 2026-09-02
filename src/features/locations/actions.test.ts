import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/meetups/provider-budget", () => ({
  claimGeoapifyProviderBudget: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { claimGeoapifyProviderBudget } from "@/features/meetups/provider-budget";
import { requireUser } from "@/lib/auth/require-user";

import { removeMeetupOrigin, saveMeetupOrigin } from "./actions";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function input() {
  const data = new FormData();
  data.set("psgcAreaCode", "0722170010");
  data.set("psgcRelease", "2026-q2");
  return data;
}

function authorize() {
  const rpc = vi.fn((name: string) => Promise.resolve(
    name === "resolve_psgc_area"
      ? {
          data: {
            active: true,
            code: "0722170010",
            current: true,
            name: "Lahug",
            path: [
              { code: "0700000000", name: "Central Visayas", type: "region" },
              { code: "0722000000", name: "Cebu", type: "province" },
              { code: "0722170000", name: "City of Cebu", type: "city" },
              { code: "0722170010", name: "Lahug", type: "barangay" },
            ],
            release: "2026-q2",
            type: "barangay",
          },
          error: null,
        }
      : { data: "11111111-1111-4111-8111-111111111111", error: null },
  ));
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: ACTOR_ID },
  } as never);
  return rpc;
}

function mcp(structuredContent: unknown) {
  return new Response(JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    result: { isError: false, structuredContent },
  }));
}

describe("renter meetup-origin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_PROVIDER_CONFIG_VERSION = "geoapify-v1";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-renter-origin-secret-value";
    vi.mocked(claimGeoapifyProviderBudget).mockResolvedValue(true);
  });

  it("resolves a current canonical path and persists only the server-derived centroid", async () => {
    const rpc = authorize();
    const request = vi.fn().mockResolvedValue(mcp({
      results: [{
        country_code: "ph",
        formatted: "Lahug, Cebu City, Cebu, Philippines",
        lat: 10.3341,
        lon: 123.9056,
        place_id: "provider:barangay:lahug",
      }],
    }));
    vi.stubGlobal("fetch", request);

    await expect(saveMeetupOrigin({ status: "idle" }, input())).resolves.toEqual({
      status: "success",
    });
    expect(claimGeoapifyProviderBudget).toHaveBeenCalledWith(ACTOR_ID, 1);
    expect(request.mock.calls[0]?.[1]?.body).toContain(
      "Central Visayas, Cebu, City of Cebu, Lahug, Philippines",
    );
    expect(rpc).toHaveBeenCalledWith("replace_my_meetup_origin", {
      p_accuracy_meters: null,
      p_area_code: "0722170010",
      p_captured_at: expect.any(String),
      p_consent_version: null,
      p_latitude: 10.3341,
      p_longitude: 123.9056,
      p_precision: "barangay_centroid",
      p_provenance_version: "renter-default-origin-v1",
      p_provider_reference: "provider:barangay:lahug",
      p_release_key: "2026-q2",
      p_source: "provider_centroid",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });

  it("fails closed before provider and persistence when authentication is absent", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("private auth detail"));
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(saveMeetupOrigin({ status: "idle" }, input())).resolves.toEqual({
      error: "unauthorized",
      status: "error",
    });
    expect(request).not.toHaveBeenCalled();
    expect(claimGeoapifyProviderBudget).not.toHaveBeenCalled();
  });

  it("removes only through the actor-owned RPC", async () => {
    const rpc = authorize();
    await expect(removeMeetupOrigin({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("remove_my_meetup_origin");
    expect(revalidatePath).toHaveBeenCalledWith("/account");
  });
});
