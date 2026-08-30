import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database.generated";

import { isProtectedRoute, loginPath, sanitizeReturnTo } from "../auth/routes";
import { getSupabasePublicConfig } from "./config";
import { fetchWithSupabaseServerDeadline } from "./fetch";

type OutgoingCookie = {
  name: string;
  options: CookieOptions;
  value: string;
};

function applyAuthResponseState(
  response: NextResponse,
  cookies: Map<string, OutgoingCookie>,
  headers: Map<string, string>,
) {
  cookies.forEach(({ name, options, value }) => {
    response.cookies.set(name, value, options);
  });
  headers.forEach((value, name) => response.headers.set(name, value));
  return response;
}

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const outgoingCookies = new Map<string, OutgoingCookie>();
  const outgoingHeaders = new Map<string, string>();
  const { publishableKey, url } = getSupabasePublicConfig();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, options, value }) => {
          const cookie = { name, options, value };
          outgoingCookies.set(name, cookie);
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([name, value]) => {
          outgoingHeaders.set(name, value);
          response.headers.set(name, value);
        });
      },
    },
    global: { fetch: fetchWithSupabaseServerDeadline },
  });

  // Keep this call immediately after client creation. It validates the JWT and
  // refreshes expiring sessions before any response can be committed.
  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && Boolean(data?.claims.sub);
  const pathname = request.nextUrl.pathname;

  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const returnTo = `${pathname}${request.nextUrl.search}`;
    return applyAuthResponseState(
      NextResponse.redirect(new URL(loginPath(returnTo), request.url)),
      outgoingCookies,
      outgoingHeaders,
    );
  }

  if (pathname === "/login" && isAuthenticated) {
    return applyAuthResponseState(
      NextResponse.redirect(
        new URL(
          sanitizeReturnTo(request.nextUrl.searchParams.get("next")),
          request.url,
        ),
      ),
      outgoingCookies,
      outgoingHeaders,
    );
  }

  return response;
}
