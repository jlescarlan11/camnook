import { z } from "zod";

export const SAFE_MEETUP_PLAN_COLUMNS =
  "booking_id,renter_city_label,venue_name,venue_address,venue_city,venue_latitude,venue_longitude,provider,provider_config_version,attribution,created_at,plan_kind,source_place_id,source_place_version,arrival_instructions";

const meetupPlanBaseSchema = z.object({
  booking_id: z.uuid(),
  created_at: z.string().min(1),
  plan_kind: z
    .enum(["public_venue", "canonical_area", "preferred_area", "lender_place"])
    .optional(),
  source_place_id: z.uuid().nullable().optional(),
  source_place_version: z.number().int().positive().nullable().optional(),
  arrival_instructions: z.string().max(500).nullable().optional(),
  renter_city_label: z.string().min(1).max(160),
});

export const safeMeetupPlanRowSchema = z.union([
  meetupPlanBaseSchema
    .extend({
      plan_kind: z.literal("lender_place"),
      renter_city_label: z.null(),
      source_place_id: z.uuid(),
      source_place_version: z.number().int().positive(),
      arrival_instructions: z.string().max(500),
      attribution: z.string().nullable(),
      provider: z.null(),
      provider_config_version: z.null(),
      venue_address: z.string().min(2).max(300),
      venue_city: z.string().min(2).max(120),
      venue_latitude: z.coerce.number().min(-90).max(90),
      venue_longitude: z.coerce.number().min(-180).max(180),
      venue_name: z.string().min(2).max(200),
    })
    .strict(),
  meetupPlanBaseSchema
    .extend({
      plan_kind: z.literal("public_venue").optional(),
      attribution: z.literal(
        "© OpenStreetMap contributors · Powered by Geoapify",
      ),
      provider: z.literal("geoapify"),
      provider_config_version: z.string().min(1).max(64),
      venue_address: z.string().min(2).max(300),
      venue_city: z.string().min(2).max(120),
      venue_latitude: z.coerce.number().min(-90).max(90),
      venue_longitude: z.coerce.number().min(-180).max(180),
      venue_name: z.string().min(2).max(200),
    })
    .strict(),
  meetupPlanBaseSchema
    .extend({
      plan_kind: z.enum(["canonical_area", "preferred_area"]).optional(),
      attribution: z.null(),
      provider: z.null(),
      provider_config_version: z.null(),
      venue_address: z.null(),
      venue_city: z.null(),
      venue_latitude: z.null(),
      venue_longitude: z.null(),
      venue_name: z.null(),
    })
    .strict(),
]);

export type SafeMeetupPlanRow = z.infer<typeof safeMeetupPlanRowSchema>;

export function projectMeetupPlan(row: SafeMeetupPlanRow) {
  if (row.renter_city_label === null) {
    return {
      kind: "lender_place" as const,
      name: row.venue_name,
      address: row.venue_address,
      city: row.venue_city,
      latitude: row.venue_latitude,
      longitude: row.venue_longitude,
      arrivalInstructions: row.arrival_instructions,
      attribution: row.attribution,
      createdAt: row.created_at,
      renterCity: null,
    };
  }
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
