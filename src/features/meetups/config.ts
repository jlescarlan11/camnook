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
    .refine((values) => new Set(values).size === values.length),
  apiKey: z.string().trim().min(8),
  configVersion: z.string().trim().min(1).max(64),
  referenceSecret: z.string().min(32),
  searchRadiusMeters: z.number().int().min(1_000).max(20_000),
  timeoutMs: z.number().int().min(500).max(10_000),
});

export type MeetupProviderConfig = z.infer<typeof schema>;

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
    referenceSecret: process.env.MEETUP_RECOMMENDATION_SECRET,
    searchRadiusMeters: numberFromEnvironment(
      process.env.MEETUP_SEARCH_RADIUS_METERS,
      8_000,
    ),
    timeoutMs: numberFromEnvironment(process.env.MEETUP_PROVIDER_TIMEOUT_MS, 4_000),
  });
  return parsed.success ? parsed.data : null;
}
