import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { z } from "zod";
import { addressPathSchema, addressReferenceSchema, psgcChoicesSchema } from "./types";

export async function loadAddressReference(client: SupabaseClient<Database>) {
  const result = await client.schema("api").rpc("list_psgc_address_reference");
  if (result.error) throw new Error("reference_unavailable");
  return addressReferenceSchema.parse(result.data);
}
export function addressReferenceReaders(client: SupabaseClient<Database>) {
  return {
    async listChildren(parent: string) {
      const result = await client.schema("api").rpc("list_psgc_area_choices", {p_parent_code: parent});
      if (result.error) throw new Error("reference_unavailable");
      return psgcChoicesSchema.parse(result.data);
    },
    async resolveArea(release: string, code: string) {
      const result = await client.schema("api").rpc("resolve_psgc_area", {p_release_key: release, p_area_code: code});
      if (result.error) throw new Error("reference_unavailable");
      return z.object({ release: z.string(), active: z.boolean(), current: z.boolean(), path: addressPathSchema }).parse(result.data);
    },
  };
}
