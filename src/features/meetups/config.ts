import "server-only";

import { z } from "zod";

export const REVIEWED_GEOAPIFY_CATEGORIES = [
  "commercial.shopping_mall",
  "public_transport.train",
  "public_transport.bus",
  "activity.community_center",
] as const;

const schema = z.object({
  allowedCategories: z
    .array(z.enum(REVIEWED_GEOAPIFY_CATEGORIES))
    .min(1)
    .max(REVIEWED_GEOAPIFY_CATEGORIES.length)
    .refine((values) => new Set(values).size === values.length),
  apiKey: z.string().trim().min(8),
  configVersion: z.string().trim().min(1).max(64),
  referenceSecret: z.string().min(32),
  searchRadiusMeters: z.number().int().min(1_000).max(20_000),
  timeoutMs: z.number().int().min(500).max(10_000),
});

const referenceSecretSchema = z.string().min(32);

export const meetupRoutingConfigSchema = z
  .object({
    accessToken: z.string().trim().min(16).max(512),
    maxCandidates: z.number().int().min(1).max(8),
    maxElements: z.number().int().min(2).max(16),
    profile: z.literal("driving-traffic"),
    routingPolicyVersion: z.string().trim().min(1).max(64),
    timeoutMs: z.number().int().min(500).max(10_000),
  })
  .refine(
    (config) => config.maxElements === config.maxCandidates * 2,
    "Mapbox element bound must equal two origins times the candidate bound.",
  );

export type MeetupProviderConfig = z.infer<typeof schema>;
export type MeetupRoutingConfig = z.infer<typeof meetupRoutingConfigSchema>;

function numberFromEnvironment(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  return Number(value);
}
export function getMeetupProviderConfig(): MeetupProviderConfig | null {
  const categories = (process.env.MEETUP_ALLOWED_CATEGORIES ?? "")
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);
  const parsed = schema.safeParse({
    allowedCategories: categories,
    apiKey: process.env.GEOAPIFY_API_KEY,
    configVersion: process.env.MEETUP_PROVIDER_CONFIG_VERSION ?? "geoapify-v1",
    referenceSecret: getMeetupReferenceSecret(),
    searchRadiusMeters: numberFromEnvironment(
      process.env.MEETUP_SEARCH_RADIUS_METERS,
      8_000,
    ),
    timeoutMs: numberFromEnvironment(process.env.MEETUP_PROVIDER_TIMEOUT_MS, 4_000),
  });
  return parsed.success ? parsed.data : null;
}

export function getMeetupReferenceSecret() {
  const parsed = referenceSecretSchema.safeParse(
    process.env.MEETUP_RECOMMENDATION_SECRET,
  );
  return parsed.success ? parsed.data : null;
}

export function getMeetupRoutingPolicyVersion() {
  const parsed = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .safeParse(process.env.MEETUP_ROUTING_POLICY_VERSION ?? "mapbox-matrix-v1");
  return parsed.success ? parsed.data : null;
}

export function getMeetupRoutingConfig(): MeetupRoutingConfig | null {
  const parsed = meetupRoutingConfigSchema.safeParse({
    accessToken: process.env.MAPBOX_ACCESS_TOKEN,
    maxCandidates: numberFromEnvironment(
      process.env.MEETUP_ROUTING_MAX_CANDIDATES,
      8,
    ),
    maxElements: numberFromEnvironment(process.env.MEETUP_ROUTING_MAX_ELEMENTS, 16),
    profile: process.env.MEETUP_ROUTING_PROFILE ?? "driving-traffic",
    routingPolicyVersion: getMeetupRoutingPolicyVersion(),
    timeoutMs: numberFromEnvironment(process.env.MEETUP_ROUTING_TIMEOUT_MS, 4_000),
  });
  return parsed.success ? parsed.data : null;
}
