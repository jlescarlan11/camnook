import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { Coordinate, NormalizedCity, ProviderPlace } from "./domain";

export type ProviderFailureCode =
  | "empty"
  | "malformed"
  | "network"
  | "quota"
  | "timeout"
  | "unsupported_city";

export class ProviderBoundaryError extends Error {
  constructor(readonly code: ProviderFailureCode) {
    super(code);
    this.name = "ProviderBoundaryError";
  }
}

const reverseResponseSchema = z.object({
  results: z.array(
    z.object({
      city: z.string().trim().min(1).optional(),
      municipality: z.string().trim().min(1).optional(),
      county: z.string().trim().min(1).optional(),
      country_code: z.string().trim().length(2),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      place_id: z.string().trim().min(1).optional(),
      result_type: z.string().optional(),
    }),
  ),
});

const placesResponseSchema = z.object({
  results: z.array(
    z.object({
      categories: z.array(z.string().trim().min(1)),
      city: z.string().trim().min(1).optional(),
      formatted: z.string().trim().min(1).optional(),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      name: z.string().trim().min(1).optional(),
      place_id: z.string().trim().min(1),
    }),
  ),
});

const mcpResponseSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }).optional(),
  jsonrpc: z.literal("2.0"),
  result: z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
    })
    .optional(),
});

type GeoapifyAdapterOptions = {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  timeoutMs: number;
};

export class GeoapifyAdapter {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: GeoapifyAdapterOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  private async requestTool(name: string, argumentsValue: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    // Geoapify's MCP transport accepts POST bodies and header authentication.
    // This keeps both the credential and exact reverse-geocoding position out of
    // URLs. The EU host provides the processing boundary documented in its DPA.
    const url = new URL("/v1/mcp", "https://api-eu.geoapify.com");

    try {
      const response = await this.fetchImplementation(url, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: argumentsValue, name },
        }),
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": this.options.apiKey,
        },
        method: "POST",
        signal: controller.signal,
      });
      if (response.status === 429) throw new ProviderBoundaryError("quota");
      if (!response.ok) throw new ProviderBoundaryError("network");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderBoundaryError("malformed");
      }
      const envelope = mcpResponseSchema.safeParse(payload);
      if (!envelope.success) throw new ProviderBoundaryError("malformed");
      if (envelope.data.error || envelope.data.result?.isError) {
        throw new ProviderBoundaryError("network");
      }
      if (envelope.data.result?.structuredContent === undefined) {
        throw new ProviderBoundaryError("malformed");
      }
      return envelope.data.result.structuredContent;
    } catch (error) {
      if (error instanceof ProviderBoundaryError) throw error;
      if (controller.signal.aborted) throw new ProviderBoundaryError("timeout");
      throw new ProviderBoundaryError("network");
    } finally {
      clearTimeout(timeout);
    }
  }

  async reverseGeocodeCity(position: Coordinate): Promise<NormalizedCity> {
    const payload = await this.requestTool("reverse_geocode_coordinates", {
      country_codes: ["ph"],
      lang: "en",
      lat: position.latitude,
      limit: 1,
      lon: position.longitude,
      type: "city",
    });
    const parsed = reverseResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderBoundaryError("malformed");
    const result = parsed.data.results[0];
    if (!result) throw new ProviderBoundaryError("empty");
    const label = result.city ?? result.municipality ?? result.county;
    if (!label || result.country_code.toUpperCase() !== "PH") {
      throw new ProviderBoundaryError("unsupported_city");
    }
    return {
      countryCode: "PH",
      label,
      latitude: result.lat,
      longitude: result.lon,
      providerCityId:
        result.place_id ??
        `geoapify-city:${createHash("sha256")
          .update(
            `${result.country_code.toLowerCase()}|${label.toLowerCase()}|${result.lat}|${result.lon}`,
          )
          .digest("hex")}`,
    };
  }

  async searchPublicPlaces(input: {
    allowedCategories: readonly string[];
    center: Coordinate;
    radiusMeters: number;
  }): Promise<ProviderPlace[]> {
    const payloads = await Promise.all(
      input.allowedCategories.map((category) =>
        this.requestTool("search_places", {
          category,
          lang: "en",
          lat: input.center.latitude,
          limit: 20,
          lon: input.center.longitude,
          radius_meters: input.radiusMeters,
        }),
      ),
    );
    const normalized = payloads.flatMap((payload) => {
      const parsed = placesResponseSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderBoundaryError("malformed");
      return parsed.data.results.map((properties) => ({
        address: properties.formatted ?? "",
        categories: properties.categories,
        city: properties.city ?? "",
        latitude: properties.lat,
        longitude: properties.lon,
        name: properties.name ?? "",
        providerPlaceId: properties.place_id,
      }));
    });
    const unique = new Map<string, ProviderPlace>();
    for (const place of normalized) {
      const existing = unique.get(place.providerPlaceId);
      unique.set(
        place.providerPlaceId,
        existing
          ? {
              ...existing,
              categories: [...new Set([...existing.categories, ...place.categories])],
            }
          : place,
      );
    }
    return [...unique.values()];
  }
}
