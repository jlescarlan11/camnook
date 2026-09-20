import { test } from "vitest";
import assert from "node:assert/strict";
import {
  assertDevelopment,
  composeDevelopment,
  developmentUrl,
} from "./local-development.mjs";
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dev-public",
  SUPABASE_SERVICE_ROLE_KEY: "dev-service",
  GEOAPIFY_API_KEY: "server-key",
  MEETUP_RECOMMENDATION_SECRET: "development-secret",
};
test("refuses production and lookalike database origins", () => {
  for (const url of [
    "https://iegcixcevvkryfwfotqz.supabase.co",
    developmentUrl + ".example.com",
    developmentUrl + "/unexpected",
  ])
    assert.throws(() =>
      assertDevelopment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url }),
    );
  assert.throws(() =>
    assertDevelopment({ ...valid, VERCEL_ENV: "production" }),
  );
});
test("does not expose the server key as the map key", () => {
  assert.throws(() =>
    assertDevelopment({
      ...valid,
      NEXT_PUBLIC_GEOAPIFY_MAP_KEY: valid.GEOAPIFY_API_KEY,
    }),
  );
});
test("ignores downloaded production public credentials and unrelated secrets", () => {
  const result = composeDevelopment(
    {
      NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dev-public",
    },
    {
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: "https://iegcixcevvkryfwfotqz.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "prod-public",
      VERCEL_OIDC_TOKEN: "unrelated",
      CRON_SECRET: "unrelated",
    },
    { NEXT_PUBLIC_GEOAPIFY_MAP_KEY: "browser-key" },
  );
  assert.equal(result.NEXT_PUBLIC_SUPABASE_URL, developmentUrl);
  assert.equal(result.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "dev-public");
  assert.equal(result.NEXT_PUBLIC_GEOAPIFY_MAP_KEY, "browser-key");
  assert.equal(result.VERCEL_OIDC_TOKEN, undefined);
  assert.equal(result.CRON_SECRET, undefined);
});
test("prefers the reviewed Vercel Development map key over the local fallback", () => {
  const result = composeDevelopment(
    {
      NEXT_PUBLIC_SUPABASE_URL: developmentUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dev-public",
    },
    {
      ...valid,
      NEXT_PUBLIC_GEOAPIFY_MAP_KEY: "vercel-development-browser-key",
    },
    { NEXT_PUBLIC_GEOAPIFY_MAP_KEY: "older-local-browser-key" },
  );
  assert.equal(
    result.NEXT_PUBLIC_GEOAPIFY_MAP_KEY,
    "vercel-development-browser-key",
  );
});
