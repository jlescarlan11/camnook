const DEFAULT_AUTHENTICATED_ROUTE = "/account";
const MAX_RETURN_TO_LENGTH = 1_024;
const PROTECTED_ROUTE_ROOTS = ["/account", "/admin"] as const;

function isRouteWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_ROOTS.some((root) => isRouteWithin(pathname, root));
}

export function sanitizeReturnTo(candidate: string | null | undefined) {
  if (!candidate) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
  if (candidate.length > MAX_RETURN_TO_LENGTH) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  try {
    const base = new URL("https://camnook.invalid");
    const parsed = new URL(candidate, base);

    if (
      parsed.origin !== base.origin ||
      !isProtectedRoute(parsed.pathname)
    ) {
      return DEFAULT_AUTHENTICATED_ROUTE;
    }

    const returnTo = `${parsed.pathname}${parsed.search}`;
    return returnTo.length <= MAX_RETURN_TO_LENGTH
      ? returnTo
      : DEFAULT_AUTHENTICATED_ROUTE;
  } catch {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
}

export function loginPath(returnTo: string) {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `/login?next=${encodeURIComponent(safeReturnTo)}`;
}
