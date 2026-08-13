import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loginPath } from "./routes";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { supabase, user };
}

export async function requireUser() {
  const context = await getAuthenticatedUser();

  if (!context) {
    throw new AuthenticationRequiredError();
  }

  return context;
}

export async function requirePageUser(returnTo: string) {
  const context = await getAuthenticatedUser();

  if (!context) {
    redirect(loginPath(returnTo));
  }

  return context;
}
