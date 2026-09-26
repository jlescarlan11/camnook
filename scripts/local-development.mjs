import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nextEnv = createRequire(require.resolve("next/package.json"))(
  "@next/env",
);

export const developmentUrl = "https://ekmoiepalelqpmemvrkl.supabase.co";
export function assertDevelopment(env) {
  if (
    env.NEXT_PUBLIC_SUPABASE_URL !== developmentUrl ||
    env.VERCEL_ENV === "production"
  ) {
    throw new Error(
      "Refusing local startup: only the CamNook Development database is allowed.",
    );
  }
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEOAPIFY_API_KEY",
    "MEETUP_RECOMMENDATION_SECRET",
  ]) {
    if (!env[name]?.trim())
      throw new Error(`Missing ${name}. Run pnpm dev:setup.`);
  }
  if (
    env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY &&
    env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY === env.GEOAPIFY_API_KEY
  ) {
    throw new Error(
      "The browser map key must be separate from the server Geoapify key.",
    );
  }
}
function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}
export function composeDevelopment(publicEnv, downloaded, prior) {
  const result = { ...publicEnv };
  for (const [name, value] of Object.entries(downloaded)) {
    if (
      /^(GEOAPIFY_API_KEY|SUPABASE_SERVICE_ROLE_KEY|MAPBOX_ACCESS_TOKEN|MEETUP_[A-Z_]+|RESIDENTIAL_GEOCODING_TIMEOUT_MS)$/.test(
        name,
      )
    )
      result[name] = value;
  }
  if (downloaded.NEXT_PUBLIC_GEOAPIFY_MAP_KEY)
    result.NEXT_PUBLIC_GEOAPIFY_MAP_KEY =
      downloaded.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
  else if (prior.NEXT_PUBLIC_GEOAPIFY_MAP_KEY)
    result.NEXT_PUBLIC_GEOAPIFY_MAP_KEY = prior.NEXT_PUBLIC_GEOAPIFY_MAP_KEY;
  assertDevelopment(result);
  return result;
}
async function request(url, options = {}) {
  try {
    return await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "Development service request failed or timed out; credentials were not logged.",
    );
  }
}
async function databaseChecks(env) {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    const response = await request(`${developmentUrl}/auth/v1/settings`, {
      headers: { apikey: env[name] },
    });
    if (!response.ok)
      throw new Error(
        `${name} is not valid for the Development database (HTTP ${response.status}).`,
      );
  }
  console.log("Development database credentials verified.");
  const response = await request(
    `${developmentUrl}/rest/v1/rpc/get_camera_meetup_places`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Profile": "api",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_camera_id: "00000000-0000-0000-0000-000000000000",
      }),
    },
  );
  const payload = await response.json();
  // The service role deliberately cannot call this renter-only read function.
  // An explicit function permission error confirms schema discovery, not E2E success.
  const discovered =
    response.ok ||
    (response.status === 403 &&
      payload.code === "42501" &&
      payload.message ===
        "permission denied for function get_camera_meetup_places");
  return discovered
    ? []
    : [
        `Development meetup RPC is not ready (HTTP ${response.status}). Apply the pending migrations to Development.`,
      ];
}
async function check(env) {
  assertDevelopment(env);
  const problems = await databaseChecks(env);
  const search = new URL("https://api.geoapify.com/v1/geocode/search");
  search.search = new URLSearchParams({
    text: "Ayala Center Cebu",
    filter: "countrycode:ph",
    format: "json",
    apiKey: env.GEOAPIFY_API_KEY,
  }).toString();
  const response = await request(search);
  const data = response.ok ? await response.json() : null;
  if (
    !data?.results?.some(
      (place) => Number.isFinite(place.lat) && Number.isFinite(place.lon),
    )
  )
    problems.push(`Live Geoapify search failed (HTTP ${response.status}).`);
  else console.log("Live Geoapify search returned places with coordinates.");
  if (!env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY)
    problems.push(
      "Missing NEXT_PUBLIC_GEOAPIFY_MAP_KEY: configure a separate development browser key allowing localhost and 127.0.0.1.",
    );
  else
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      const tile = new URL(
        "https://maps.geoapify.com/v1/tile/osm-bright/12/3457/1929.png",
      );
      tile.searchParams.set("apiKey", env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY);
      const result = await request(tile, {
        headers: { Origin: origin, Referer: `${origin}/` },
      });
      if (
        !result.ok ||
        !result.headers.get("content-type")?.startsWith("image/")
      )
        problems.push(
          `Map tile check failed for ${origin} (HTTP ${result.status}).`,
        );
      await result.body?.cancel();
    }
  if (env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY) {
    const geocoding = new URL(
      "https://api.geoapify.com/v1/geocode/search",
    );
    geocoding.search = new URLSearchParams({
      text: "Ayala Center Cebu",
      format: "json",
      limit: "1",
      apiKey: env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY,
    }).toString();
    const geocodingResult = await request(geocoding, {
      headers: {
        Origin: "https://example.com",
        Referer: "https://example.com/",
      },
    });
    if (![401, 403].includes(geocodingResult.status))
      problems.push(
        "Browser map key accepted an unapproved origin; restrict it to reviewed web origins.",
      );
    await geocodingResult.body?.cancel();
  }
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(
    "Development dependencies ready. Browser flow verification is still a separate check.",
  );
}
export function startDevelopmentServer() {
  // Package-manager shims are not executable by shell-free spawn on Windows.
  // Retain the Node runtime that already passed the local setup checks.
  const child = spawnSync(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"],
    { stdio: "inherit", env: process.env },
  );
  if (child.error)
    throw new Error(`Could not start the local Next.js server: ${child.error.message}`);
  return child.status ?? 1;
}
async function main() {
  const command = process.argv[2];
  if (command === "setup") {
    mkdirSync(".vercel/local-development", { recursive: true, mode: 0o700 });
    const destination = ".vercel/local-development/downloaded.env";
    const pull = spawnSync(
      "pnpm",
      [
        "dlx",
        "vercel@59.23.2",
        "env",
        "pull",
        destination,
        "--environment=development",
        "--yes",
      ],
      { stdio: "inherit" },
    );
    if (pull.status !== 0)
      throw new Error("Could not pull Development configuration.");
    chmodSync(destination, 0o600);
    const env = composeDevelopment(
      readEnv(".env.local"),
      readEnv(destination),
      readEnv(".env.development.local"),
    );
    await databaseChecks(env);
    writeFileSync(
      ".env.development.local",
      Object.entries(env)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    chmodSync(".env.development.local", 0o600);
    console.log(
      "Saved verified Development configuration to ignored .env.development.local.",
    );
    await check(env);
    return;
  }
  nextEnv.loadEnvConfig(process.cwd(), true);
  if (command === "check") return check(process.env);
  if (command === "start") {
    await check(process.env);
    process.exitCode = startDevelopmentServer();
    return;
  }
  throw new Error(
    "Usage: node scripts/local-development.mjs setup|check|start",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
