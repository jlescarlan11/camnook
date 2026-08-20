import { z } from "zod";

export const SAFE_MEETUP_PLAN_COLUMNS =
  "booking_id,renter_city_label,venue_name,venue_address,venue_city,venue_latitude,venue_longitude,provider,provider_config_version,attribution,created_at";

export const safeMeetupPlanRowSchema = z
  .object({
    attribution: z.literal("© OpenStreetMap contributors · Powered by Geoapify"),
    booking_id: z.uuid(),
    created_at: z.string().min(1),
    provider: z.literal("geoapify"),
    provider_config_version: z.string().min(1).max(64),
    renter_city_label: z.string().min(2).max(120),
    venue_address: z.string().min(2).max(300),
    venue_city: z.string().min(2).max(120),
    venue_latitude: z.coerce.number().min(-90).max(90),
    venue_longitude: z.coerce.number().min(-180).max(180),
    venue_name: z.string().min(2).max(200),
  })
  .strict();

export type SafeMeetupPlanRow = z.infer<typeof safeMeetupPlanRowSchema>;

export function projectMeetupPlan(row: SafeMeetupPlanRow) {
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
  };
}

export type SafeMeetupPlan = ReturnType<typeof projectMeetupPlan>;
