import { z } from "zod";

import { getResidentialGeocodingConfig } from "@/features/meetups/config";
import { GeoapifyAdapter, ProviderBoundaryError } from "@/features/meetups/provider";
import { claimGeoapifyProviderBudget } from "@/features/meetups/provider-budget";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { addressReferenceReaders, loadAddressReference } from "@/features/locations/address-reference";
import { matchAddressAreas } from "@/features/locations/address-matcher";

const MAX_REQUEST_BYTES = 2_048;

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    latitude: z.number().finite().min(4).max(22),
    longitude: z.number().finite().min(116).max(127),
    accuracyMeters: z.number().finite().positive().max(50_000),
    mode: z.literal("address"),
  }).strict(),
  z.object({
    mode: z.literal("search"),
    query: z.string().trim().min(3).max(300)
      .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)),
  }).strict(),
  z.object({
    latitude: z.number().finite().min(4).max(22),
    longitude: z.number().finite().min(116).max(127),
    mode: z.literal("reverse"),
  }).strict(),
]);

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json",
};

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try { context = await getAuthenticatedUser(); }
  catch { return json({ error: "unavailable" }, 503); }
  if (!context) return json({ error: "unauthorized" }, 401);

  const body = await readBoundedBody(request);
  if (body === null) return json({ error: "too_large" }, 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  let reference;
  if (parsed.data.mode === "address") {
    try { reference = await loadAddressReference(context.supabase); }
    catch { return json({ error: "reference_unavailable" }, 503); }
  }

  const config = getResidentialGeocodingConfig();
  if (!config || !(await claimGeoapifyProviderBudget(context.user.id, 1))) {
    return json({ error: "unavailable" }, 503);
  }

  const adapter = new GeoapifyAdapter({
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs,
  });
  try {
    if (parsed.data.mode === "address" && reference) {
      const hints = await adapter.reverseGeocodeAddressAreas(parsed.data);
      if (hints.countryCode !== "PH") return json({ error: "outside_philippines" }, 422);
      try {
        const result = await matchAddressAreas({
          hints, accuracyMeters: parsed.data.accuracyMeters, reference,
          ...addressReferenceReaders(context.supabase),
        });
        return json(result, 200);
      } catch { return json({ error: "reference_unavailable" }, 503); }
    }
    if (parsed.data.mode === "search") {
      const suggestions = await adapter.searchResidentialAddresses(
        parsed.data.query,
      );
      return json({ suggestions }, 200);
    }
    const result = await adapter.reverseGeocodeResidentialAddress(parsed.data);
    return json(result, 200);
  } catch (error) {
    const status = error instanceof ProviderBoundaryError && error.code === "empty"
      ? 404
      : error instanceof ProviderBoundaryError && error.code === "quota"
        ? 429
        : 502;
    return json({ error: status === 404 ? "empty" : "provider" }, status);
  }
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_REQUEST_BYTES) {
    return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      try { await reader.cancel(); } catch { /* The size rejection remains decisive. */ }
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return "";
  }
}

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), { headers: responseHeaders, status });
}
