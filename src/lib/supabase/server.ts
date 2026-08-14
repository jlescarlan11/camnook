import "server-only";

import {
  clearAuthCookiesAtScopes,
  createServerClient,
} from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database.generated";

import { getSupabasePublicConfig } from "./config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = getSupabasePublicConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. The same client can be used
          // from Server Actions and Route Handlers, where cookie writes work.
        }
      },
    },
  });
}

export async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies();
  const { url } = getSupabasePublicConfig();
  const projectRef = new URL(url).hostname.split(".")[0];

  if (!projectRef) {
    throw new Error("Unable to determine the Supabase Auth cookie namespace");
  }

  await clearAuthCookiesAtScopes({
    getAll: () => cookieStore.getAll(),
    scopes: [{ path: "/" }],
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, options, value }) => {
        cookieStore.set(name, value, options);
      });
    },
    storageKey: `sb-${projectRef}-auth-token`,
  });
}
