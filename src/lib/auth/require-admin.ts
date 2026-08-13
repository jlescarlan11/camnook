import "server-only";

import { redirect } from "next/navigation";

import { loginPath } from "./routes";
import {
  AuthenticationRequiredError,
  getAuthenticatedUser,
  requireUser,
} from "./require-user";

type AuthenticatedContext = NonNullable<
  Awaited<ReturnType<typeof getAuthenticatedUser>>
>;

export class AdminAuthorizationRequiredError extends Error {
  constructor() {
    super("Administrator authorization required");
    this.name = "AdminAuthorizationRequiredError";
  }
}

export class AdminAuthorizationCheckError extends Error {
  constructor() {
    super("Administrator authorization could not be verified");
    this.name = "AdminAuthorizationCheckError";
  }
}

export async function getAdminStatus({ supabase }: AuthenticatedContext) {
  const { data, error } = await supabase.schema("api").rpc("is_admin");

  if (error || typeof data !== "boolean") {
    throw new AdminAuthorizationCheckError();
  }

  return data;
}

export async function requireAdmin() {
  const context = await requireUser();

  if (!(await getAdminStatus(context))) {
    throw new AdminAuthorizationRequiredError();
  }

  return context;
}

export async function requirePageAdmin(returnTo: string) {
  const context = await getAuthenticatedUser();

  if (!context) {
    redirect(loginPath(returnTo));
  }

  if (!(await getAdminStatus(context))) {
    redirect("/forbidden");
  }

  return context;
}

export function isAuthenticationError(error: unknown) {
  return error instanceof AuthenticationRequiredError;
}
