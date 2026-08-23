import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GeoapifyAdapter, ProviderBoundaryError } from "./provider";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function mcp(structuredContent: unknown) {
  return {
    id: 1,
    jsonrpc: "2.0",
    result: { isError: false, structuredContent },
  };
}

describe("GeoapifyAdapter", () => {
  it("requests a city-level reverse result and returns only normalized context", async () => {
    const request = vi.fn().mockResolvedValue(
      response(
        mcp({
          results: [
            {
              city: "Cebu City",
              country_code: "ph",
              formatted: "private input-derived street address",
              lat: 10.3157,
              lon: 123.8854,
              place_id: "city-cebu",
              result_type: "city",
            },
          ],
        }),
      ),
    );
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: request,
      timeoutMs: 100,
    });

    const city = await adapter.reverseGeocodeCity({
      latitude: 10.30123456,
      longitude: 123.90123456,
    });

    expect(city).toEqual({
      countryCode: "PH",
      label: "Cebu City",
      latitude: 10.3157,
      longitude: 123.8854,
      providerCityId: "city-cebu",
    });
    const calledUrl = request.mock.calls[0]?.[0] as URL;
    const calledInit = request.mock.calls[0]?.[1] as RequestInit;
    expect(calledUrl.pathname).toBe("/v1/mcp");
    expect(calledUrl.search).toBe("");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toMatchObject({ "x-api-key": "secret-key" });
    expect(calledInit.body).toContain('"type":"city"');
    expect(calledInit.body).toContain('"lat":10.30123456');
    expect(String(calledUrl)).not.toMatch(/secret-key|10\.30123456|123\.90123456/);
    expect(JSON.stringify(city)).not.toContain("private input-derived");
  });

  it("normalizes places without leaking the enclosing raw response", async () => {
    const request = vi.fn().mockResolvedValue(
      response(
        mcp({
          results: [
            {
              categories: ["commercial.shopping_mall"],
              city: "Cebu City",
              formatted: "Cardinal Rosales Avenue, Cebu City",
              internal: "provider-only-payload",
              lat: 10.3172,
              lon: 123.9054,
              name: "Ayala Center Cebu",
              place_id: "place-ayala",
            },
          ],
        }),
      ),
    );
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: request,
      timeoutMs: 100,
    });

    const places = await adapter.searchPublicPlaces({
      allowedCategories: ["commercial.shopping_mall"],
      center: { latitude: 10.3157, longitude: 123.8854 },
      radiusMeters: 8000,
    });

    expect(places).toEqual([
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        categories: ["commercial.shopping_mall"],
        city: "Cebu City",
        latitude: 10.3172,
        longitude: 123.9054,
        name: "Ayala Center Cebu",
        providerPlaceId: "place-ayala",
      },
    ]);
    expect(JSON.stringify(places)).not.toContain("provider-only-payload");
  });

  it("validates a manual Philippine city through the structured city tool", async () => {
    const request = vi.fn().mockResolvedValue(
      response(
        mcp({
          results: [
            {
              city: "Mandaue City",
              country_code: "ph",
              lat: 10.3236,
              lon: 123.9222,
              place_id: "city-mandaue",
              result_type: "city",
            },
          ],
        }),
      ),
    );
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: request,
      timeoutMs: 100,
    });

    await expect(adapter.geocodeCity("Mandaue City")).resolves.toEqual({
      countryCode: "PH",
      label: "Mandaue City",
      latitude: 10.3236,
      longitude: 123.9222,
      providerCityId: "city-mandaue",
    });
    expect(request.mock.calls[0]?.[1]?.body).toContain(
      '"name":"geocode_structured_address"',
    );
    expect(request.mock.calls[0]?.[1]?.body).toContain('"city":"Mandaue City"');
    expect(request.mock.calls[0]?.[1]?.body).not.toContain("street");
  });

  it.each([
    [429, "quota"],
    [500, "network"],
  ] as const)("maps HTTP %s to %s without response details", async (status, code) => {
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn().mockResolvedValue(response({ private: true }, status)),
      timeoutMs: 100,
    });

    await expect(
      adapter.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toMatchObject({ code, message: code });
  });

  it("maps invalid JSON and invalid shapes to malformed", async () => {
    const invalidJson = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(new Response("not-json", { status: 200 })),
      timeoutMs: 100,
    });
    const invalidShape = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(response(mcp({ results: "private" }))),
      timeoutMs: 100,
    });

    await expect(
      invalidJson.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("malformed"));
    await expect(
      invalidShape.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("malformed"));
  });

  it("maps a JSON-RPC provider error to a constrained network failure", async () => {
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn().mockResolvedValue(
        response({
          error: { code: -32000, message: "private provider diagnostic" },
          id: 1,
          jsonrpc: "2.0",
        }),
      ),
      timeoutMs: 100,
    });

    await expect(
      adapter.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("network"));
  });

  it("derives a stable city reference when the provider omits its optional ID", async () => {
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn().mockResolvedValue(
        response(
          mcp({
            results: [
              {
                city: "Cebu City",
                country_code: "ph",
                lat: 10.3157,
                lon: 123.8854,
              },
            ],
          }),
        ),
      ),
      timeoutMs: 100,
    });

    await expect(
      adapter.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).resolves.toMatchObject({
      providerCityId: expect.stringMatching(/^geoapify-city:[a-f0-9]{64}$/),
    });
  });

  it.each([
    ["control-character city", `Cebu\u0000City`, "city-cebu"],
    ["oversized city", "C".repeat(121), "city-cebu"],
    ["undersized provider city ID", "Cebu City", "p"],
    ["control-character provider city ID", "Cebu City", `city\u0000cebu`],
    ["oversized provider city ID", "Cebu City", "p".repeat(241)],
  ])("rejects %s before normalized city output", async (_case, city, placeId) => {
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn().mockResolvedValue(
        response(
          mcp({
            results: [
              {
                city,
                country_code: "ph",
                lat: 10.3157,
                lon: 123.8854,
                place_id: placeId,
                result_type: "city",
              },
            ],
          }),
        ),
      ),
      timeoutMs: 100,
    });

    await expect(
      adapter.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("malformed"));
  });

  it("aborts a provider request at the configured timeout", async () => {
    const adapter = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted with private detail", "AbortError")),
          );
        });
      }),
      timeoutMs: 5,
    });

    await expect(
      adapter.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("timeout"));
  });

  it("fails unsupported countries and empty city results closed", async () => {
    const unsupported = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi.fn().mockResolvedValue(
        response(
          mcp({
            results: [
            {
              city: "Singapore",
              country_code: "sg",
              lat: 1.29,
              lon: 103.85,
              place_id: "city-singapore",
            },
          ],
          }),
        ),
      ),
      timeoutMs: 100,
    });
    const empty = new GeoapifyAdapter({
      apiKey: "secret-key",
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(response(mcp({ results: [] }))),
      timeoutMs: 100,
    });

    await expect(
      unsupported.reverseGeocodeCity({ latitude: 1.29, longitude: 103.85 }),
    ).rejects.toEqual(new ProviderBoundaryError("unsupported_city"));
    await expect(
      empty.reverseGeocodeCity({ latitude: 10, longitude: 123 }),
    ).rejects.toEqual(new ProviderBoundaryError("empty"));
  });
});
