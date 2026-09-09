import { z } from "zod";

import { psgcAreaTypeSchema } from "@/features/locations/types";

export const kycProfileSchema = z.object({
  active: z.boolean(),
  address_details: z.string().min(1).max(200).nullable(),
  address_format_version: z.union([z.literal(1), z.literal(2)]),
  address_line1: z.string().min(3).max(500),
  address_revision: z.uuid(),
  area_code: z.string().regex(/^\d{10}$/),
  area_name: z.string().min(1).max(160),
  area_type: psgcAreaTypeSchema,
  birth_date: z.iso.date(),
  building: z.string().min(1).max(160).nullable(),
  current: z.boolean(),
  house_number: z.string().min(1).max(80).nullable(),
  path: z.array(z.object({
    code: z.string().regex(/^\d{10}$/),
    name: z.string().min(1).max(160),
    type: psgcAreaTypeSchema,
  }).strict()),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  postal_code: z.string().min(1).max(16).nullable(),
  residential_pin: z.object({
    accuracy_meters: z.coerce.number().positive().max(50_000).nullable(),
    confirmed_at: z.string().min(1),
    latitude: z.coerce.number().min(4).max(22),
    longitude: z.coerce.number().min(116).max(127),
    source: z.enum(["device_gps", "map_pin"]),
  }).strict().nullable(),
  street_name: z.string().min(1).max(160).nullable(),
}).strict().nullable();

export type KycProfile = {
  addressDetails: string;
  addressFormatVersion: 1 | 2;
  addressLine1: string;
  addressRevision: string;
  areaCode: string;
  areaName: string;
  birthDate: string;
  building: string;
  current: boolean;
  houseNumber: string;
  path: Array<{
    code: string;
    name: string;
    type: z.infer<typeof psgcAreaTypeSchema>;
  }>;
  release: string;
  postalCode: string;
  residentialPin: null | {
    accuracyMeters: number | null;
    confirmedAt: string;
    latitude: number;
    longitude: number;
    source: "device_gps" | "map_pin";
  };
  streetName: string;
};

export function projectKycProfile(value: NonNullable<z.infer<typeof kycProfileSchema>>): KycProfile {
  return {
    addressDetails: value.address_details ?? "",
    addressFormatVersion: value.address_format_version,
    addressLine1: value.address_line1,
    addressRevision: value.address_revision,
    areaCode: value.area_code,
    areaName: value.area_name,
    birthDate: value.birth_date,
    building: value.building ?? "",
    current: value.active && value.current && value.area_type === "barangay",
    houseNumber: value.house_number ?? "",
    path: value.path,
    release: value.release,
    postalCode: value.postal_code ?? "",
    residentialPin: value.residential_pin ? {
      accuracyMeters: value.residential_pin.accuracy_meters,
      confirmedAt: value.residential_pin.confirmed_at,
      latitude: value.residential_pin.latitude,
      longitude: value.residential_pin.longitude,
      source: value.residential_pin.source,
    } : null,
    streetName: value.street_name ?? "",
  };
}

export function formatResidentialLine1(input: {
  addressDetails: string;
  building: string;
  houseNumber: string;
  streetName: string;
}) {
  const numberedStreet = [input.houseNumber.trim(), input.streetName.trim()]
    .filter(Boolean)
    .join(" ");
  return [input.building, numberedStreet, input.addressDetails]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}
