import {
  getMeetupProviderConfig,
  getMeetupRoutingConfig,
} from "@/features/meetups/config";
import {
  buildDiscoverySeeds,
  rankEligiblePlaces,
} from "@/features/meetups/domain";
import { GeoapifyAdapter } from "@/features/meetups/provider";
import { MapboxMatrixAdapter } from "@/features/meetups/routing-provider";
import { runResidentialProductionSmoke } from "@/features/kyc/production-smoke";

export const dynamic = "force-dynamic";

const PRODUCTION_PROJECT_REF = "iegcixcevvkryfwfotqz";
const MANAGEMENT_AUTH_URL =
  `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/config/auth`;
const PUBLIC_OWNER_ORIGIN = { latitude: 10.3157, longitude: 123.8854 };
const PUBLIC_RENTER_ORIGIN = { latitude: 10.3236, longitude: 123.9222 };
const PUBLIC_ROUTE_TARGETS = [
  { latitude: 10.3172, longitude: 123.9054 },
  { latitude: 10.3308, longitude: 123.9067 },
  { latitude: 10.3103, longitude: 123.9494 },
];
const PUBLIC_CEBU_TILE_URL =
  "https://maps.geoapify.com/v1/tile/osm-bright/12/3457/1929.png";
const PUBLIC_GEOCODING_PROBE_URL =
  "https://api.geoapify.com/v1/geocode/search?text=Ayala%20Center%20Cebu&format=json&limit=1";
const PRODUCTION_ORIGIN = "https://camnook.shop";
const DISALLOWED_ORIGIN = "https://example.com";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length >= 20 ? token : null;
}

async function hasProductionManagementAccess(token: string) {
  try {
    const response = await fetch(MANAGEMENT_AUTH_URL, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        // The authorization status remains decisive if the body already closed.
      }
    }
    return response.ok;
  } catch {
    return false;
  }
}

async function cancelBody(response: Response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The status and headers remain decisive if the body already closed.
  }
}

function isProviderDenial(response: Response) {
  return response.status === 401 || response.status === 403;
}

async function verifyResidentialMapKeyBoundary(serverApiKey: string) {
  const browserMapKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY?.trim();
  if (
    !browserMapKey ||
    browserMapKey.length < 20 ||
    browserMapKey === serverApiKey
  ) {
    return false;
  }

  try {
    const productionTileUrl = new URL(PUBLIC_CEBU_TILE_URL);
    productionTileUrl.searchParams.set("apiKey", browserMapKey);
    const productionTile = await fetch(productionTileUrl, {
      cache: "no-store",
      headers: {
        Origin: PRODUCTION_ORIGIN,
        Referer: `${PRODUCTION_ORIGIN}/account`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const isPng = productionTile.headers.get("content-type")
      ?.toLowerCase().startsWith("image/png") ?? false;
    await cancelBody(productionTile);
    if (!productionTile.ok || !isPng) return false;

    const geocodingUrl = new URL(PUBLIC_GEOCODING_PROBE_URL);
    geocodingUrl.searchParams.set("apiKey", browserMapKey);
    const geocoding = await fetch(geocodingUrl, {
      cache: "no-store",
      headers: {
        Origin: DISALLOWED_ORIGIN,
        Referer: `${DISALLOWED_ORIGIN}/`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const geocodingDenied = isProviderDenial(geocoding);
    await cancelBody(geocoding);
    return geocodingDenied;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (
    process.env.VERCEL_ENV !== "production" ||
    !token ||
    !(await hasProductionManagementAccess(token))
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const providerConfig = getMeetupProviderConfig();
  const routingConfig = getMeetupRoutingConfig();
  if (!providerConfig || !routingConfig) {
    return Response.json({ error: "configuration_unavailable" }, { status: 503 });
  }

  // Two browser-key boundary probes, one reverse lookup, one matrix, and one
  // search per category.
  const providerRequestCount = 4 + providerConfig.allowedCategories.length;
  if (providerRequestCount > 8) {
    return Response.json({ error: "provider_plan_unbounded" }, { status: 503 });
  }

  let stage = "residential_map_key_boundary";
  try {
    if (!(await verifyResidentialMapKeyBoundary(providerConfig.apiKey))) {
      return Response.json(
        { error: "residential_map_configuration_unavailable" },
        { status: 503 },
      );
    }

    stage = "geoapify";
    const geoapify = new GeoapifyAdapter({
      apiKey: providerConfig.apiKey,
      timeoutMs: providerConfig.timeoutMs,
    });
    const renterCity = await geoapify.reverseGeocodeCity(PUBLIC_RENTER_ORIGIN);
    const discoverySeeds = buildDiscoverySeeds(PUBLIC_OWNER_ORIGIN, renterCity);
    const places = await geoapify.searchPublicPlaces({
      allowedCategories: providerConfig.allowedCategories,
      center: discoverySeeds[0],
      radiusMeters: providerConfig.searchRadiusMeters,
    });
    const eligible = rankEligiblePlaces(
      places,
      discoverySeeds[0],
      providerConfig.allowedCategories,
      {
        allowedLocalities: ["Cebu City", renterCity.label],
        discoverySeeds,
        radiusMeters: providerConfig.searchRadiusMeters,
      },
    );
    if (!eligible.length) {
      return Response.json({ error: "geoapify_unavailable" }, { status: 503 });
    }

    stage = "mapbox";
    const routes = await new MapboxMatrixAdapter(
      routingConfig,
    ).calculateTravelTimes({
      ownerOrigin: PUBLIC_OWNER_ORIGIN,
      renterOrigin: PUBLIC_RENTER_ORIGIN,
      targets: PUBLIC_ROUTE_TARGETS,
    });
    if (
      !routes.some((route) => route.ownerSeconds !== null) ||
      !routes.some((route) => route.renterSeconds !== null)
    ) {
      return Response.json({ error: "mapbox_unavailable" }, { status: 503 });
    }

    stage = "residential_kyc";
    await runResidentialProductionSmoke();

    return Response.json({
      geoapify: "passed",
      mapbox: "passed",
      providerRequestCount,
      residentialKyc: "passed",
      residentialMapKeyBoundary: "passed",
      routeElementCount: routes.length * 2,
    });
  } catch {
    console.error("Production meetup provider readiness check failed", { stage });
    return Response.json({ error: "provider_unavailable" }, { status: 503 });
  }
}
