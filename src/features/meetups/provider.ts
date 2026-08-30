import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  Coordinate,
  NormalizedCity,
  ProviderAddressSuggestion,
  ProviderPlace,
} from "./domain";

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

const MAX_PROVIDER_RESPONSE_BYTES = 512 * 1024;

const providerCityPartSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L} .'-]+$/u)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const providerCityIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(240)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

const reverseResponseSchema = z.object({
  results: z.array(
    z.object({
      city: providerCityPartSchema.optional(),
      municipality: providerCityPartSchema.optional(),
      county: providerCityPartSchema.optional(),
      country_code: z.string().trim().length(2),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      place_id: providerCityIdSchema.optional(),
      result_type: z.string().optional(),
    }),
  ).max(1),
});

const placesResponseSchema = z.object({
  results: z.array(
    z.object({
      categories: z.array(z.string().trim().min(1).max(120)).max(50),
      city: z.string().trim().min(1).max(120).optional(),
      formatted: z.string().trim().min(1).max(300).optional(),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      name: z.string().trim().min(1).max(200).optional(),
      place_id: z.string().trim().min(1).max(240),
    }),
  ).max(20),
});

const citySearchResponseSchema = z.object({
  results: z.array(
    z.object({
      city: providerCityPartSchema.optional(),
      municipality: providerCityPartSchema.optional(),
      county: providerCityPartSchema.optional(),
      country_code: z.string().trim().length(2),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      place_id: providerCityIdSchema.optional(),
      result_type: z.string().optional(),
    }),
  ).max(5),
});

const providerAddressPartSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

const addressSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      address_line1: providerAddressPartSchema.optional(),
      address_line2: providerAddressPartSchema.optional(),
      city: providerCityPartSchema.optional(),
      country_code: z.string().trim().length(2),
      county: providerCityPartSchema.optional(),
      formatted: providerAddressPartSchema.optional(),
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
      municipality: providerCityPartSchema.optional(),
      place_id: providerCityIdSchema.optional(),
      result_type: z.string().trim().min(1).max(64).optional(),
    }),
  ).max(5),
});

const mcpResponseSchema = z.object({
  error: z.object({ code: z.number(), message: z.string().max(500) }).optional(),
  jsonrpc: z.literal("2.0"),
  result: z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
    })
    .optional(),
});

async function readBoundedProviderJson(response: Response) {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw new ProviderBoundaryError("malformed");
  }

  if (!response.body) throw new ProviderBoundaryError("malformed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size rejection remains decisive if the provider already closed.
      }
      throw new ProviderBoundaryError("malformed");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new ProviderBoundaryError("malformed");
  }
}

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
      const payload = await readBoundedProviderJson(response);
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
    const normalizedLabel = label.replace(/\s+/g, " ");
    return {
      countryCode: "PH",
      label: normalizedLabel,
      latitude: result.lat,
      longitude: result.lon,
      providerCityId:
        result.place_id ??
        `geoapify-city:${createHash("sha256")
          .update(
            `${result.country_code.toLowerCase()}|${normalizedLabel.toLowerCase()}|${result.lat}|${result.lon}`,
          )
          .digest("hex")}`,
    };
  }

  async geocodeCity(city: string): Promise<NormalizedCity> {
    const payload = await this.requestTool("geocode_structured_address", {
      city,
      country: "Philippines",
      country_codes: ["ph"],
      lang: "en",
      limit: 5,
    });
    const parsed = citySearchResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderBoundaryError("malformed");
    const result = parsed.data.results.find(
      (candidate) =>
        candidate.country_code.toUpperCase() === "PH" &&
        ["city", "locality"].includes(candidate.result_type ?? "") &&
        Boolean(candidate.city ?? candidate.municipality ?? candidate.county),
    );
    if (!result) throw new ProviderBoundaryError("unsupported_city");
    const label = (result.city ?? result.municipality ?? result.county!).replace(
      /\s+/g,
      " ",
    );
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

  async searchAddressSuggestions(
    query: string,
  ): Promise<ProviderAddressSuggestion[]> {
    const payload = await this.requestTool("geocode_address", {
      country_codes: ["ph"],
      lang: "en",
      limit: 5,
      query,
    });
    const parsed = addressSearchResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderBoundaryError("malformed");

    const normalized = parsed.data.results.flatMap((result) => {
      const city = result.city ?? result.municipality ?? result.county;
      const address =
        result.formatted ??
        [result.address_line1, result.address_line2].filter(Boolean).join(", ");
      const resultType = result.result_type?.toLowerCase();
      if (
        result.country_code.toUpperCase() !== "PH" ||
        !city ||
        !address ||
        resultType !== "amenity"
      ) {
        return [];
      }

      const normalizedAddress = address.replace(/\s+/g, " ");
      const normalizedCity = city.replace(/\s+/g, " ");
      return [
        {
          address: normalizedAddress,
          city: normalizedCity,
          latitude: result.lat,
          longitude: result.lon,
          providerAddressId:
            result.place_id ??
            `geoapify-address:${createHash("sha256")
              .update(
                `${result.country_code.toLowerCase()}|${normalizedAddress.toLowerCase()}|${result.lat}|${result.lon}`,
              )
              .digest("hex")}`,
        },
      ];
    });

    const unique = new Map<string, ProviderAddressSuggestion>();
    for (const suggestion of normalized) {
      if (!unique.has(suggestion.providerAddressId)) {
        unique.set(suggestion.providerAddressId, suggestion);
      }
    }
    return [...unique.values()];
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
