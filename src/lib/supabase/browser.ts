import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.generated";

import { getSupabasePublicConfig } from "./config";

export function createSupabaseBrowserClient() {
  const { publishableKey, url } = getSupabasePublicConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
