import "server-only";

import { cookies } from "next/headers";

import { sanitizeReturnTo } from "./routes";
import { emailSchema } from "./validation";

const PENDING_EMAIL_COOKIE = "camnook-auth-email";
const PENDING_RETURN_TO_COOKIE = "camnook-auth-return-to";
const PENDING_LOGIN_MAX_AGE_SECONDS = 15 * 60;

const pendingLoginCookieOptions = {
  httpOnly: true,
  maxAge: PENDING_LOGIN_MAX_AGE_SECONDS,
  path: "/login",
  priority: "high" as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function setPendingLogin(email: string, returnTo: string) {
  const cookieStore = await cookies();

  cookieStore.set(PENDING_EMAIL_COOKIE, email, pendingLoginCookieOptions);
  cookieStore.set(
    PENDING_RETURN_TO_COOKIE,
    sanitizeReturnTo(returnTo),
    pendingLoginCookieOptions,
  );
}

export async function getPendingLogin() {
  const cookieStore = await cookies();
  const email = emailSchema.safeParse(
    cookieStore.get(PENDING_EMAIL_COOKIE)?.value,
  );

  if (!email.success) {
    return null;
  }

  return {
    email: email.data,
    returnTo: sanitizeReturnTo(
      cookieStore.get(PENDING_RETURN_TO_COOKIE)?.value,
    ),
  };
}

export async function clearPendingLogin() {
  const cookieStore = await cookies();
  const expiredOptions = {
    ...pendingLoginCookieOptions,
    maxAge: 0,
  };

  // The cookies are scoped to /login, so expire them with that same path.
  cookieStore.set(PENDING_EMAIL_COOKIE, "", expiredOptions);
  cookieStore.set(PENDING_RETURN_TO_COOKIE, "", expiredOptions);
}

export function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
  return `${visibleLocal}${"•".repeat(Math.max(2, localPart.length - visibleLocal.length))}@${domain}`;
}
