import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MeetupRoutingConfig } from "./config";
import {
  MapboxMatrixAdapter,
  RoutingBoundaryError,
} from "./routing-provider";

const config: MeetupRoutingConfig = {
  accessToken: "mapbox-server-token-value",
  maxCandidates: 8,
  maxElements: 16,
  profile: "driving-traffic",
  routingPolicyVersion: "mapbox-matrix-v1",
  timeoutMs: 500,
};
const origins = {
  ownerOrigin: { latitude: 10.3157, longitude: 123.8854 },
  renterOrigin: { latitude: 10.3012, longitude: 123.9012 },
};

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { headers, status });
}

describe("MapboxMatrixAdapter", () => {
  it("builds an asymmetric 2×8 duration-only Matrix request and preserves nulls", async () => {
    const durations = [
      Array.from({ length: 8 }, (_, index) => (index === 3 ? null : 300 + index)),
      Array.from({ length: 8 }, (_, index) => 400 + index),
    ];
    const request = vi.fn().mockResolvedValue(response({ code: "Ok", durations }));
    const adapter = new MapboxMatrixAdapter(config, { fetchImplementation: request });
    const targets = Array.from({ length: 8 }, (_, index) => ({
      latitude: 10.32 + index * 0.001,
      longitude: 123.91 + index * 0.001,
    }));

    const result = await adapter.calculateTravelTimes({ ...origins, targets });
    expect(result).toHaveLength(8);
    expect(result[3]).toEqual({ ownerSeconds: null, renterSeconds: 403 });
    const url = request.mock.calls[0]?.[0] as URL;
    expect(url.origin).toBe("https://api.mapbox.com");
    expect(url.pathname).toContain("/directions-matrix/v1/mapbox/driving-traffic/");
    expect(url.searchParams.get("sources")).toBe("0;1");
    expect(url.searchParams.get("destinations")).toBe("2;3;4;5;6;7;8;9");
    expect(url.searchParams.get("annotations")).toBe("duration");
    expect(url.searchParams.has("fallback_speed")).toBe(false);
    expect(url.pathname).not.toMatch(/search|geocod/i);
  });

  it.each([
    [{ latitude: 91, longitude: 123 }, [origins.renterOrigin]],
    [origins.ownerOrigin, []],
    [origins.ownerOrigin, Array.from({ length: 9 }, () => origins.renterOrigin)],
  ])("rejects invalid or oversized inputs before network access", async (ownerOrigin, targets) => {
    const request = vi.fn();
    const adapter = new MapboxMatrixAdapter(config, { fetchImplementation: request });
    await expect(
      adapter.calculateTravelTimes({ ownerOrigin, renterOrigin: origins.renterOrigin, targets }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects an unsupported runtime profile before network access", async () => {
    const request = vi.fn();
    const adapter = new MapboxMatrixAdapter(
      { ...config, profile: "walking" } as unknown as MeetupRoutingConfig,
      { fetchImplementation: request },
    );
    await expect(
      adapter.calculateTravelTimes({
        ...origins,
        targets: [origins.ownerOrigin],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [422, "invalid_request"],
    [429, "quota"],
    [500, "unavailable"],
  ] as const)("maps HTTP %s to a safe %s failure", async (status, code) => {
    const adapter = new MapboxMatrixAdapter(config, {
      fetchImplementation: vi.fn().mockResolvedValue(
        response({ message: "token and coordinate-bearing provider detail" }, status),
      ),
    });
    const failure = await adapter
      .calculateTravelTimes({ ...origins, targets: [origins.ownerOrigin] })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code });
    expect(String(failure)).not.toMatch(/token|coordinate/i);
  });

  it("rejects malformed shapes and oversized bodies without returning raw data", async () => {
    for (const providerResponse of [
      response({ code: "Ok", durations: [[1], [2], [3]] }),
      response({ code: "Ok", durations: [[1], [2]] }, 200, {
        "content-length": String(65 * 1024),
      }),
    ]) {
      const adapter = new MapboxMatrixAdapter(config, {
        fetchImplementation: vi.fn().mockResolvedValue(providerResponse),
      });
      await expect(
        adapter.calculateTravelTimes({
          ...origins,
          targets: [origins.ownerOrigin],
        }),
      ).rejects.toEqual(new RoutingBoundaryError("malformed"));
    }
  });

  it("aborts a slow request and returns only the timeout class", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url: URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("secret URL", "AbortError")),
        );
      }),
    );
    const adapter = new MapboxMatrixAdapter(
      { ...config, timeoutMs: 500 },
      { fetchImplementation: request as typeof fetch },
    );
    const pending = adapter.calculateTravelTimes({
      ...origins,
      targets: [origins.ownerOrigin],
    });
    const assertion = expect(pending).rejects.toEqual(
      new RoutingBoundaryError("timeout"),
    );
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
    vi.useRealTimers();
  });
});
