import { z } from "zod";

export const SAFE_MEETUP_PLAN_COLUMNS =
  "booking_id,renter_city_label,venue_name,venue_address,venue_city,venue_latitude,venue_longitude,provider,provider_config_version,attribution,created_at";

const meetupPlanBaseSchema = z.object({
    booking_id: z.uuid(),
    created_at: z.string().min(1),
    renter_city_label: z.string().min(2).max(120),
});

export const safeMeetupPlanRowSchema = z.union([
  meetupPlanBaseSchema.extend({
    attribution: z.literal("© OpenStreetMap contributors · Powered by Geoapify"),
    provider: z.literal("geoapify"),
    provider_config_version: z.string().min(1).max(64),
    venue_address: z.string().min(2).max(300),
    venue_city: z.string().min(2).max(120),
    venue_latitude: z.coerce.number().min(-90).max(90),
    venue_longitude: z.coerce.number().min(-180).max(180),
    venue_name: z.string().min(2).max(200),
  }).strict(),
  meetupPlanBaseSchema.extend({
    attribution: z.null(),
    provider: z.null(),
    provider_config_version: z.null(),
    venue_address: z.null(),
    venue_city: z.null(),
    venue_latitude: z.null(),
    venue_longitude: z.null(),
    venue_name: z.null(),
  }).strict(),
]);

export type SafeMeetupPlanRow = z.infer<typeof safeMeetupPlanRowSchema>;

export function projectMeetupPlan(row: SafeMeetupPlanRow) {
  if (row.provider === null) {
    return {
      areaLabel: row.renter_city_label,
      createdAt: row.created_at,
      kind: "canonical_area" as const,
      renterCity: row.renter_city_label,
    };
  }
  return {
    address: row.venue_address,
    attribution: row.attribution,
    city: row.venue_city,
    configVersion: row.provider_config_version,
    createdAt: row.created_at,
    latitude: row.venue_latitude,
    longitude: row.venue_longitude,
    name: row.venue_name,
    provider: row.provider,
    renterCity: row.renter_city_label,
    kind: "public_venue" as const,
  };
}

export type SafeMeetupPlan = ReturnType<typeof projectMeetupPlan>;
