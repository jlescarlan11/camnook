import { z } from "zod";
import { canonicalPath, projectAddressPath } from "./address-presentation";
import { addressGroupSchema, addressPathSchema, type AddressGroupId, type AddressPath, type AddressReference, type PsgcChoice } from "./types";

export type AddressSelectionState = { groupId: AddressGroupId | null; canonicalPath: AddressPath; release: string };
const draftSchema = z.object({
  version: z.literal(2), groupId: addressGroupSchema.nullable(), canonicalPath: addressPathSchema,
  release: z.string().regex(/^\d{4}-q[1-4]$/),
});
export function restoredAddress(value: unknown, initialPath: AddressPath) {
  const draft = draftSchema.safeParse(value);
  if (draft.success) return {path:draft.data.canonicalPath, groupId:draft.data.groupId};
  const legacy = addressPathSchema.safeParse(value);
  return {path:legacy.success ? legacy.data : initialPath, groupId:null};
}
export async function prepareAddressSelection(reference: AddressReference, input: AddressPath,
  listChildren: (parent: string) => Promise<PsgcChoice[]>) {
  const parent = [...input].reverse().find(n => n.type !== "barangay" && reference.nodes.some(p => p.code === n.code));
  let path = parent ? canonicalPath(reference, parent.code) : [];
  const last = path.at(-1);
  let barangays: PsgcChoice[] = [];
  if (last && ["city","municipality","submunicipality"].includes(last.type) &&
    !reference.nodes.some(n => n.parentCode === last.code && n.type === "submunicipality")) {
    barangays = (await listChildren(last.code)).filter(n => n.type === "barangay");
    const requested = input.find(n => n.type === "barangay");
    const valid = barangays.find(n => n.code === requested?.code);
    if (valid) path = [...path, {code:valid.code,name:valid.name,type:valid.type}];
  }
  return {path, barangays, groupId:projectAddressPath(reference,path).groupId};
}
