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
const PRODUCTION_ORIGIN = "https://camnook.shop";

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

async function verifyResidentialMapTiles(serverApiKey: string) {
  const browserMapKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY?.trim();
  if (
    !browserMapKey ||
    browserMapKey.length < 20 ||
    browserMapKey === serverApiKey
  ) {
    return false;
  }

  try {
    const url = new URL(PUBLIC_CEBU_TILE_URL);
    url.searchParams.set("apiKey", browserMapKey);
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Origin: PRODUCTION_ORIGIN,
        Referer: `${PRODUCTION_ORIGIN}/account`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const isPng = response.headers.get("content-type")
      ?.toLowerCase().startsWith("image/png") ?? false;
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        // The status and content type remain decisive if the body closed.
      }
    }
    return response.ok && isPng;
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

  // One tile, one reverse lookup, one matrix, and one search per category.
  const providerRequestCount = 3 + providerConfig.allowedCategories.length;
  if (providerRequestCount > 7) {
    return Response.json({ error: "provider_plan_unbounded" }, { status: 503 });
  }

  try {
    if (!(await verifyResidentialMapTiles(providerConfig.apiKey))) {
      return Response.json(
        { error: "residential_map_configuration_unavailable" },
        { status: 503 },
      );
    }

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

    await runResidentialProductionSmoke();

    return Response.json({
      geoapify: "passed",
      mapbox: "passed",
      providerRequestCount,
      residentialKyc: "passed",
      residentialMapTiles: "passed",
      routeElementCount: routes.length * 2,
    });
  } catch {
    console.error("Production meetup provider readiness check failed");
    return Response.json({ error: "provider_unavailable" }, { status: 503 });
  }
}
