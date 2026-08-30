import { afterEach, describe, expect, it } from "vitest";

import { hasValidCronAuthorization } from "./authorization";

const originalSecret = process.env.CRON_SECRET;

function request(authorization?: string) {
  return new Request("https://camnook.test/api/internal/job", {
    headers: authorization ? { authorization } : {},
  });
}

describe("cron authorization", () => {
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("accepts only the exact bearer value for a sufficiently strong secret", () => {
    process.env.CRON_SECRET = "synthetic-secret-with-adequate-length";

    expect(
      hasValidCronAuthorization(
        request("Bearer synthetic-secret-with-adequate-length"),
      ),
    ).toBe(true);
    expect(
      hasValidCronAuthorization(
        request("Bearer synthetic-secret-with-adequate-length-extra"),
      ),
    ).toBe(false);
    expect(
      hasValidCronAuthorization(
        request("Basic synthetic-secret-with-adequate-length"),
      ),
    ).toBe(false);
  });

  it.each([undefined, "", "short-secret"])(
    "fails closed for a missing or weak configured secret",
    (secret) => {
      if (secret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = secret;

      expect(hasValidCronAuthorization(request(`Bearer ${secret ?? ""}`))).toBe(
        false,
      );
    },
  );

  it("rejects a missing authorization header", () => {
    process.env.CRON_SECRET = "synthetic-secret-with-adequate-length";

    expect(hasValidCronAuthorization(request())).toBe(false);
  });
});
