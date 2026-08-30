import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { getSupabasePrivilegedConfig } from "./config";
import { fetchWithSupabaseServerDeadline } from "./fetch";

export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in the server environment");
  }

  const { url } = getSupabasePrivilegedConfig();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetchWithSupabaseServerDeadline },
  });
}
