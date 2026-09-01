import "server-only";

import { z } from "zod";

import {
  meetupRoutingConfigSchema,
  type MeetupRoutingConfig,
} from "./config";
import { coordinateSchema, type Coordinate } from "./domain";

const MAX_RESPONSE_BYTES = 64 * 1024;

const matrixResponseSchema = z.object({
  code: z.literal("Ok"),
  durations: z.array(
    z.array(z.number().finite().nonnegative().nullable()).max(8),
  ).length(2),
});

export type RoutingBoundaryErrorCode =
  | "authentication"
  | "invalid_request"
  | "malformed"
  | "network"
  | "quota"
  | "timeout"
  | "unavailable";

export class RoutingBoundaryError extends Error {
  constructor(readonly code: RoutingBoundaryErrorCode) {
    super("Meetup routing is unavailable.");
    this.name = "RoutingBoundaryError";
  }
}

export type NormalizedRouteDuration = {
  ownerSeconds: number | null;
  renterSeconds: number | null;
};

async function readBoundedJson(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new RoutingBoundaryError("malformed");
  }
  if (!response.body) throw new RoutingBoundaryError("malformed");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RoutingBoundaryError("malformed");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof RoutingBoundaryError) throw error;
    throw new RoutingBoundaryError("malformed");
  }
}

function statusError(status: number): RoutingBoundaryErrorCode {
  if (status === 401 || status === 403) return "authentication";
  if (status === 422) return "invalid_request";
  if (status === 429) return "quota";
  return "unavailable";
}

export class MapboxMatrixAdapter {
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly config: MeetupRoutingConfig,
    options: { fetchImplementation?: typeof fetch } = {},
  ) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async calculateTravelTimes(input: {
    ownerOrigin: Coordinate;
    renterOrigin: Coordinate;
    targets: Coordinate[];
  }): Promise<NormalizedRouteDuration[]> {
    const config = meetupRoutingConfigSchema.safeParse(this.config);
    const ownerOrigin = coordinateSchema.safeParse(input.ownerOrigin);
    const renterOrigin = coordinateSchema.safeParse(input.renterOrigin);
    const targets = z
      .array(coordinateSchema)
      .min(1)
      .max(config.success ? config.data.maxCandidates : 8)
      .safeParse(input.targets);
    if (
      !config.success ||
      !ownerOrigin.success ||
      !renterOrigin.success ||
      !targets.success
    ) {
      throw new RoutingBoundaryError("invalid_request");
    }
    const elementCount = targets.data.length * 2;
    if (elementCount > config.data.maxElements) {
      throw new RoutingBoundaryError("invalid_request");
    }

    const coordinates = [ownerOrigin.data, renterOrigin.data, ...targets.data]
      .map(({ latitude, longitude }) => `${longitude},${latitude}`)
      .join(";");
    const url = new URL(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/${config.data.profile}/${coordinates}`,
    );
    url.searchParams.set("access_token", config.data.accessToken);
    url.searchParams.set("annotations", "duration");
    url.searchParams.set("sources", "0;1");
    url.searchParams.set(
      "destinations",
      targets.data.map((_, index) => String(index + 2)).join(";"),
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.data.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        method: "GET",
        signal: controller.signal,
      });
    } catch (error) {
      throw new RoutingBoundaryError(
        error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new RoutingBoundaryError(statusError(response.status));

    const parsed = matrixResponseSchema.safeParse(await readBoundedJson(response));
    if (!parsed.success) throw new RoutingBoundaryError("malformed");
    const [ownerRoutes, renterRoutes] = parsed.data.durations;
    if (
      ownerRoutes.length !== targets.data.length ||
      renterRoutes.length !== targets.data.length
    ) {
      throw new RoutingBoundaryError("malformed");
    }
    return targets.data.map((_, index) => ({
      ownerSeconds: ownerRoutes[index] ?? null,
      renterSeconds: renterRoutes[index] ?? null,
    }));
  }
}
