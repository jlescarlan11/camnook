import { z } from "zod";

export const psgcAreaTypeSchema = z.enum([
  "region",
  "province",
  "city",
  "municipality",
  "submunicipality",
  "barangay",
]);

export const psgcChoiceSchema = z.object({
  city_class: z.enum(["CC", "HUC", "ICC"]).nullable(),
  code: z.string().regex(/^\d{10}$/),
  has_children: z.boolean(),
  name: z.string().trim().min(1).max(160),
  type: psgcAreaTypeSchema,
});

export const psgcChoicesSchema = z.object({
  choices: z.array(psgcChoiceSchema).max(50_000),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
});

export type PsgcChoice = z.infer<typeof psgcChoiceSchema>;
