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

export const addressPathSchema = z.array(psgcChoiceSchema.pick({ code: true, name: true, type: true }).strict()).max(5);
export type AddressPath = z.infer<typeof addressPathSchema>;
export const addressGroupSchema = z.enum(["metro-manila", "north-luzon", "south-luzon", "visayas", "mindanao"]);
export type AddressGroupId = z.infer<typeof addressGroupSchema>;
export const addressReferenceSchema = z.object({
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  nodes: z.array(psgcChoiceSchema.extend({
    parentCode: z.string().regex(/^\d{10}$/).nullable(),
  }).strict()).min(1).max(3000),
}).strict().superRefine(({ nodes }, ctx) => {
  const byCode = new Map(nodes.map(n => [n.code, n]));
  let valid = byCode.size === nodes.length;
  for (const node of nodes) {
    const parent = node.parentCode ? byCode.get(node.parentCode) : null;
    const allowed = node.type === "region" ? node.parentCode === null :
      node.type === "province" ? parent?.type === "region" :
      node.type === "city" ? (node.city_class === "CC" ? parent?.type === "province" : parent?.type === "region") :
      node.type === "municipality" ? parent?.type === "province" || parent?.type === "region" :
      node.type === "submunicipality" ? parent?.type === "city" : false;
    valid &&= Boolean(allowed);
    let cursor: typeof node | undefined = node;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor.code)) { valid = false; break; }
      seen.add(cursor.code);
      cursor = cursor.parentCode ? byCode.get(cursor.parentCode) : undefined;
    }
  }
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid address hierarchy" });
});
export type AddressReference = z.infer<typeof addressReferenceSchema>;
export const addressLocationResultSchema = z.object({
  outcome: z.enum(["complete", "partial", "unmatched"]),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  path: addressPathSchema,
  countryCode: z.literal("PH"),
  reason: z.enum(["matched", "barangay_missing", "ambiguous", "low_accuracy", "unrecognized"]),
}).strict().refine(r => r.outcome === "complete" ? r.path.at(-1)?.type === "barangay" :
  r.outcome === "unmatched" ? r.path.length === 0 : r.path.length > 0 && r.path.at(-1)?.type !== "barangay",
{ message: "Inconsistent address result" });
export type AddressLocationResult = z.infer<typeof addressLocationResultSchema>;
