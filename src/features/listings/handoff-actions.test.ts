import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({
  isAdminAuthorizationError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42501" &&
        "message" in error &&
        error.message === "admin authorization required",
    ),
  isAuthenticationError: (error: unknown) =>
    error instanceof Error && error.name === "AuthenticationRequiredError",
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("../meetups/provider-budget", () => ({ claimGeoapifyProviderBudget: vi.fn() }));

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";

import { claimGeoapifyProviderBudget } from "../meetups/provider-budget";
import {
  saveCameraHandoffPolicy,
  suggestHandoffAddress,
  suggestHandoffCity,
} from "./handoff-actions";
import { readHandoffCityReference } from "./handoff-city-reference";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function validSaveFields() {
  const data = fields({
    cameraId: CAMERA_ID,
    expectedVersion: "2",
    approvedTimes: "09:00\n17:00",
    enabled: "on",
  });
  data.append("weekdays", "1");
  data.append("weekdays", "3");
  return data;
}

function suggestionFields(extra: Record<string, string> = {}) {
  return fields({
    accuracy: "20",
    cameraId: CAMERA_ID,
    expectedVersion: "2",
    latitude: "10.30123456",
    locationMode: "current",
    longitude: "123.90123456",
    ...extra,
  });
}

function addressSuggestionFields(query = "Ayala Cebu") {
  return fields({
    addressQuery: query,
    cameraId: CAMERA_ID,
    expectedVersion: "2",
  });
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

function authorize(options?: {
  anchor?: Record<string, unknown>;
  anchorError?: unknown;
  replace?: { data: unknown; error: unknown };
  resolvedArea?: Record<string, unknown>;
}) {
  const anchor = {
    city_label: "Cebu City",
    country_code: "PH",
    latitude: 10.3157,
    longitude: 123.8854,
    provider_city_id: "provider:cebu",
    version: 2,
    ...options?.anchor,
  };
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      name === "get_camera_handoff_policy_admin"
        ? { data: anchor, error: options?.anchorError ?? null }
        : name === "resolve_psgc_area"
          ? { data: options?.resolvedArea ?? null, error: null }
        : (options?.replace ?? { data: 3, error: null }),
    ),
  );
  const schema = vi.fn(() => ({ rpc }));
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema },
    user: { id: ACTOR_ID },
  } as never);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema },
    user: { id: ACTOR_ID },
  } as never);
  return { rpc, schema };
}

describe("camera handoff city and policy actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_PROVIDER_CONFIG_VERSION = "geoapify-v1";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-handoff-city-secret-value";
    vi.mocked(claimGeoapifyProviderBudget).mockResolvedValue(true);
  });

  it("validates enabled schedules and duplicates before authorization", async () => {
    const data = validSaveFields();
    data.delete("weekdays");
    data.set("approvedTimes", "09:00,09:00");

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, data),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        approvedTimes: expect.any(String),
        weekdays: expect.any(String),
      },
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("denies an unauthorized suggestion before provider or database use", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("private auth detail"));
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(
      suggestHandoffCity({ status: "idle" }, suggestionFields()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
    expect(request).not.toHaveBeenCalled();
  });

  it("denies an unauthorized save without reading or replacing a policy", async () => {
    const authError = new Error("private auth detail");
    authError.name = "AuthenticationRequiredError";
    vi.mocked(requireUser).mockRejectedValue(authError);

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, validSaveFields()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("derives a safe current-city suggestion without returning or logging the position", async () => {
    const api = authorize();
    const request = vi.fn().mockResolvedValue(
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
    );
    vi.stubGlobal("fetch", request);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await suggestHandoffCity(
      { status: "idle" },
      suggestionFields(),
    );

    expect(result).toMatchObject({
      status: "success",
      suggestion: {
        cityLabel: "Mandaue City",
        expectedVersion: 2,
        reference: expect.stringMatching(/^handoff-city-v1\./),
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /10\.30123456|123\.90123456|provider:mandaue/,
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /10\.|123\.|Mandaue|reference/,
    );
    expect(String(request.mock.calls[0]?.[0])).not.toMatch(
      /10\.30123456|123\.90123456/,
    );
    expect(api.rpc).toHaveBeenCalledWith("get_camera_handoff_policy_admin", {
      p_camera_id: CAMERA_ID,
    });
    expect(api.rpc).not.toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.anything(),
    );
  });

  it("returns public address suggestions while binding the saved value to a city anchor", async () => {
    authorize();
    const request = vi.fn().mockResolvedValue(
      mcp({
        results: [
          {
            city: "Cebu City",
            country_code: "ph",
            formatted: "Cardinal Rosales Avenue, Cebu City",
            lat: 10.3172,
            lon: 123.9054,
            place_id: "place-ayala",
            result_type: "amenity",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", request);

    const result = await suggestHandoffAddress(
      { status: "idle" },
      addressSuggestionFields(),
    );

    expect(result).toMatchObject({
      query: "Ayala Cebu",
      status: "success",
      suggestions: [
        {
          addressLabel: "Cardinal Rosales Avenue, Cebu City",
          cityLabel: "Cebu City",
          expectedVersion: 2,
          reference: expect.stringMatching(/^handoff-city-v1\./),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /place-ayala|10\.3172|123\.9054/,
    );
    expect(
      readHandoffCityReference(
        result.suggestions![0]!.reference,
        "server-only-handoff-city-secret-value",
        {
          actorId: ACTOR_ID,
          cameraId: CAMERA_ID,
          configVersion: "geoapify-v1",
          expectedVersion: 2,
          now: new Date(),
        },
      )?.city,
    ).toMatchObject({ latitude: 10.317, longitude: 123.905 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects short address searches before authorization or provider use", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(
      suggestHandoffAddress(
        { status: "idle" },
        addressSuggestionFields("ab"),
      ),
    ).resolves.toEqual({ error: "invalid_address", status: "error" });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("supports manual city fallback and rejects street-like or unsupported input", async () => {
    authorize();
    const request = vi.fn().mockResolvedValue(
      mcp({
        results: [
          {
            city: "Cebu City",
            country_code: "ph",
            lat: 10.3157,
            lon: 123.8854,
            place_id: "provider:cebu",
            result_type: "city",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", request);
    await expect(
      suggestHandoffCity(
        { status: "idle" },
        suggestionFields({
          locationMode: "manual",
          manualCity: "123 Main Street",
        }),
      ),
    ).resolves.toEqual({ error: "invalid_city", status: "error" });
    await expect(
      suggestHandoffCity(
        { status: "idle" },
        suggestionFields({
          locationMode: "manual",
          manualCity: "Main Street",
        }),
      ),
    ).resolves.toEqual({ error: "invalid_city", status: "error" });
    expect(request).not.toHaveBeenCalled();
    await expect(
      suggestHandoffCity(
        { status: "idle" },
        suggestionFields({ locationMode: "manual", manualCity: "Cebu City" }),
      ),
    ).resolves.toMatchObject({
      status: "success",
      suggestion: { cityLabel: "Cebu City" },
    });
  });

  it("rejects inaccurate positions and stale policies before provider use", async () => {
    authorize();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      suggestHandoffCity(
        { status: "idle" },
        suggestionFields({ accuracy: "50001" }),
      ),
    ).resolves.toEqual({ error: "invalid_location", status: "error" });
    expect(request).not.toHaveBeenCalled();

    authorize({ anchor: { version: 3 } });
    await expect(
      suggestHandoffCity({ status: "idle" }, suggestionFields()),
    ).resolves.toEqual({ error: "stale", status: "error" });
    expect(request).not.toHaveBeenCalled();
  });

  it("constrains provider and policy-read failures without mutation", async () => {
    const provider = authorize();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ private: "provider detail" }), {
          status: 500,
        }),
      ),
    );
    await expect(
      suggestHandoffCity({ status: "idle" }, suggestionFields()),
    ).resolves.toEqual({ error: "provider_unavailable", status: "error" });
    expect(provider.rpc).not.toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.anything(),
    );

    vi.mocked(requireAdmin).mockResolvedValue({
      supabase: {
        schema: vi.fn(() => ({
          rpc: vi.fn().mockRejectedValue(new Error("private database detail")),
        })),
      },
      user: { id: ACTOR_ID },
    } as never);
    await expect(
      suggestHandoffCity({ status: "idle" }, suggestionFields()),
    ).resolves.toEqual({ error: "invalid_context", status: "error" });
  });

  it("saves only a confirmed server-derived anchor and ignores forged technical fields", async () => {
    const api = authorize();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
      ),
    );
    const suggestion = await suggestHandoffCity(
      { status: "idle" },
      suggestionFields(),
    );
    expect(suggestion.status).toBe("success");

    const data = validSaveFields();
    data.set("cityReference", suggestion.suggestion!.reference);
    data.set("cityLabel", "Forged City");
    data.set("providerCityId", "attacker:provider");
    data.set("latitude", "1");
    data.set("longitude", "2");

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, data),
    ).resolves.toEqual({
      cityLabel: "Mandaue City",
      status: "success",
      version: 3,
    });
    expect(api.rpc).toHaveBeenCalledWith("replace_camera_handoff_policy", {
      p_allowed_weekdays: [1, 3],
      p_approved_times: ["09:00", "17:00"],
      p_camera_id: CAMERA_ID,
      p_city_label: "Mandaue City",
      p_country_code: "PH",
      p_enabled: true,
      p_expected_version: 2,
      p_latitude: 10.3236,
      p_longitude: 123.9222,
      p_provider_city_id: "provider:mandaue",
    });
    expect(JSON.stringify(api.rpc.mock.calls)).not.toMatch(
      /Forged City|attacker:provider/,
    );
  });

  it("preserves the authoritative existing anchor for schedule-only saves", async () => {
    const api = authorize();

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, validSaveFields()),
    ).resolves.toEqual({
      cityLabel: "Cebu City",
      status: "success",
      version: 3,
    });
    expect(api.rpc).toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.objectContaining({
        p_city_label: "Cebu City",
        p_latitude: 10.3157,
        p_longitude: 123.8854,
        p_provider_city_id: "provider:cebu",
      }),
    );
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("derives a canonical barangay centroid server-side without requiring a legacy city anchor", async () => {
    const api = authorize({
      anchor: {
        city_label: null,
        country_code: null,
        latitude: null,
        longitude: null,
        provider_city_id: null,
      },
      resolvedArea: {
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
    });
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
    const data = validSaveFields();
    data.set("psgcRelease", "2026-q2");
    data.set("psgcAreaCode", "0722170010");
    data.set("originPrecision", "barangay_centroid");

    await expect(saveCameraHandoffPolicy({ status: "idle" }, data)).resolves.toEqual({
      cityLabel: "Lahug",
      status: "success",
      version: 3,
    });
    expect(api.rpc).not.toHaveBeenCalledWith("get_camera_handoff_policy_admin", expect.anything());
    expect(api.rpc).toHaveBeenCalledWith("replace_camera_handoff_policy_v2", expect.objectContaining({
      p_area_code: "0722170010",
      p_latitude: 10.3341,
      p_longitude: 123.9056,
      p_precision: "barangay_centroid",
      p_provider_reference: "provider:barangay:lahug",
      p_release_key: "2026-q2",
      p_source: "provider_centroid",
    }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[1]?.body).toContain(
      "Central Visayas, Cebu, City of Cebu, Lahug, Philippines",
    );
  });

  it("lets the policy RPC reject a revoked admin without a separate admin lookup", async () => {
    const api = authorize({
      anchorError: {
        code: "42501",
        message: "admin authorization required",
      },
    });

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, validSaveFields()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(api.rpc).toHaveBeenCalledTimes(1);
    expect(api.rpc).not.toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.anything(),
    );
  });

  it("rejects missing legacy anchors and tampered references without mutation", async () => {
    const missing = authorize({
      anchor: {
        city_label: null,
        country_code: null,
        latitude: null,
        longitude: null,
        provider_city_id: null,
        version: 0,
      },
    });
    const legacy = validSaveFields();
    legacy.set("expectedVersion", "0");
    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, legacy),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: { city: expect.any(String) },
      status: "error",
    });
    expect(missing.rpc).not.toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.anything(),
    );

    const tampered = authorize();
    const data = validSaveFields();
    data.set("cityReference", "handoff-city-v1.invalid.invalid.invalid");
    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, data),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: { city: expect.any(String) },
      status: "error",
    });
    expect(tampered.rpc).not.toHaveBeenCalledWith(
      "replace_camera_handoff_policy",
      expect.anything(),
    );
  });

  it.each([
    ["40001", "stale"],
    ["42501", "unauthorized"],
    ["22023", "save_failed"],
  ])("maps %s without returning private database detail", async (code, error) => {
    authorize({
      replace: {
        data: null,
        error: { code, message: "private provider city and coordinates" },
      },
    });

    const result = await saveCameraHandoffPolicy(
      { status: "idle" },
      validSaveFields(),
    );

    expect(result).toEqual({ error, status: "error" });
    expect(JSON.stringify(result)).not.toContain("private provider");
  });

  it("revalidates persisted read paths after a successful save", async () => {
    authorize();
    await saveCameraHandoffPolicy({ status: "idle" }, validSaveFields());
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/cameras/${CAMERA_ID}/handoff`,
    );
  });
});
