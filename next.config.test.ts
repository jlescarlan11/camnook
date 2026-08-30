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
