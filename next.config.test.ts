import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js response security headers", () => {
  it("applies the compatible security baseline to every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([
      {
        headers: [
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(self), microphone=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/:path*",
      },
    ]);
  });
});


it("admits a supported 10 MiB catalog photo with its multipart fields", async () => {
  const form = new FormData();
  form.set("cameraId", "95000000-0000-4000-8000-000000000001");
  form.set("cameraName", "Synthetic catalog camera");
  form.set("sortPosition", "0");
  form.set("photo", new Blob([new Uint8Array(10 * 1024 * 1024)], { type: "image/jpeg" }), "synthetic-camera.jpg");
  const multipartBytes = (await new Request("https://synthetic.invalid", { method: "POST", body: form }).arrayBuffer()).byteLength;
  const bytes = createRequire(import.meta.url)("next/dist/compiled/bytes") as { parse: (size: string | number) => number };
  const configuredLimit = nextConfig.experimental?.serverActions?.bodySizeLimit ?? "1mb";
  expect(multipartBytes).toBeGreaterThan(10 * 1024 * 1024);
  expect(bytes.parse(configuredLimit)).toBeGreaterThanOrEqual(multipartBytes);
});
