import { z } from "zod";
import { placeSchema } from "@/features/meetups/places";
import { readCheckoutDraft, writeCheckoutDraft } from "@/features/kyc/checkout-draft";

const profileSchema = z.object({ legalName: z.string().max(160), phone: z.string().max(32) });
const draftSchema = z.object({
  operationId: z.uuid(),
  submitted: z.boolean().default(false),
  place: placeSchema.nullable().default(null),
  schedule: z.string().max(200),
  placeChoice: z.string().max(100),
  profile: profileSchema,
  values: profileSchema.extend({
    expectedLocation: z.string().max(500),
    intendedUse: z.string().max(1000),
  }),
});
export type RequestDraft = z.infer<typeof draftSchema>;
export function requestDraftKey(userId: string, camera: string) {
  return `camnook:request:v1:${userId}:${camera}`;
}
export function readRequestDraft(key?: string, schedule?: string): RequestDraft | undefined {
  if (key && schedule) {
    const prior = draftSchema.safeParse(readCheckoutDraft(`${key}:operation:${schedule}`));
    if (prior.success && prior.data.submitted) return prior.data;
  }
  const result = draftSchema.safeParse(readCheckoutDraft(key));
  return result.success ? result.data : undefined;
}
export function readRequestOperation(key: string | undefined, schedule: string): string | undefined {
  if (!key) return;
  const result = draftSchema.safeParse(readCheckoutDraft(`${key}:operation:${schedule}`));
  return result.success ? result.data.operationId : undefined;
}
export function writeRequestDraft(key: string | undefined, draft: RequestDraft) {
  writeCheckoutDraft(key, draft);
  if (key) writeCheckoutDraft(`${key}:operation:${draft.schedule}`, draft);
}
export function clearRequestDraft(key: string | undefined, schedule: string) {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(`${key}:operation:${schedule}`);
  }
  catch { /* Booking success must not depend on browser storage. */ }
}
