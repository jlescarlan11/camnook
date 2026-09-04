import { z } from "zod";

import { psgcAreaTypeSchema } from "@/features/locations/types";

export const kycProfileSchema = z.object({
  active: z.boolean(),
  address_line1: z.string().min(3).max(200),
  area_code: z.string().regex(/^\d{10}$/),
  area_name: z.string().min(1).max(160),
  area_type: psgcAreaTypeSchema,
  birth_date: z.iso.date(),
  current: z.boolean(),
  path: z.array(z.object({
    code: z.string().regex(/^\d{10}$/),
    name: z.string().min(1).max(160),
    type: psgcAreaTypeSchema,
  }).strict()),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
}).strict().nullable();

export type KycProfile = {
  addressLine1: string;
  areaCode: string;
  areaName: string;
  birthDate: string;
  current: boolean;
  path: Array<{
    code: string;
    name: string;
    type: z.infer<typeof psgcAreaTypeSchema>;
  }>;
  release: string;
};

export function projectKycProfile(value: NonNullable<z.infer<typeof kycProfileSchema>>): KycProfile {
  return {
    addressLine1: value.address_line1,
    areaCode: value.area_code,
    areaName: value.area_name,
    birthDate: value.birth_date,
    current: value.active && value.current && value.area_type === "barangay",
    path: value.path,
    release: value.release,
  };
}
