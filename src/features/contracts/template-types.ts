import { z } from "zod";

export const CONTRACT_TERM_KEYS = [
  "pickup",
  "return",
  "cancellation",
  "late-return",
  "damage",
  "loss",
  "non-transferability",
] as const;

export const CONTRACT_TERM_LABELS: Record<
  (typeof CONTRACT_TERM_KEYS)[number],
  string
> = {
  cancellation: "Cancellation",
  damage: "Damage",
  loss: "Loss",
  "late-return": "Late return",
  "non-transferability": "Non-transferability",
  pickup: "Pickup",
  return: "Return",
};

const contractTermSchema = z.string().trim().min(10).max(4000);

export const contractTermsSchema = z
  .object({
    cancellation: contractTermSchema,
    damage: contractTermSchema,
    loss: contractTermSchema,
    "late-return": contractTermSchema,
    "non-transferability": contractTermSchema,
    pickup: contractTermSchema,
    return: contractTermSchema,
  })
  .strict();

export const adminContractTemplateSchema = z
  .object({
    activated_at: z.string().min(1),
    approved_at: z.string().min(1),
    content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    created_at: z.string().min(1),
    id: z.uuid(),
    schema_version: z.literal(1),
    terms: contractTermsSchema,
    version: z.string().min(1).max(80),
  })
  .strict();

export const contractTemplateConfigurationSchema = z
  .object({ active: adminContractTemplateSchema.nullable() })
  .strict();

export const publishContractTemplateResponseSchema = z
  .object({
    created: z.boolean(),
    id: z.uuid(),
    version: z.string().min(1).max(80),
  })
  .strict();

export type AdminContractTemplate = z.infer<
  typeof adminContractTemplateSchema
>;
export type ContractTemplateConfiguration = z.infer<
  typeof contractTemplateConfigurationSchema
>;
export type ContractTerms = z.infer<typeof contractTermsSchema>;
