import { z } from "zod";

export const placeSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  name: z.string().min(2).max(200),
  address: z.string().min(2).max(300),
  city: z.string().min(2).max(120),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  arrival_instructions: z.string().max(500),
  attribution: z.string().nullable(),
});
export type MeetupPlace = z.infer<typeof placeSchema>;
export const placeInputSchema = placeSchema
  .omit({ id: true, version: true, attribution: true })
  .extend({
    name: z.string().trim().min(2).max(200),
    address: z.string().trim().min(2).max(300),
    city: z.string().trim().min(2).max(120),
  });
export function meetupMapUrl(
  latitude: number,
  longitude: number,
  directions = false,
) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error("Invalid meetup coordinates");
  const point = `${latitude},${longitude}`;
  return directions
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`;
}
