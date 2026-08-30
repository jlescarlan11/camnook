const APPROVED_HOSTED_SUPABASE_ORIGINS = new Set([
  "https://ekmoiepalelqpmemvrkl.supabase.co",
  "https://iegcixcevvkryfwfotqz.supabase.co",
]);
const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

function jwtRole(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const encoded = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
    const payload = JSON.parse(atob(`${encoded}${padding}`)) as unknown;
    return payload && typeof payload === "object" && "role" in payload
      ? String(payload.role)
      : null;
  } catch {
    return null;
  }
}

function isPrivilegedSupabaseKey(value: string) {
  return value.startsWith("sb_secret_") || jwtRole(value) === "service_role";
}

function assertApprovedSupabaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Refusing invalid Supabase URL");
  }

  const hasCanonicalShape =
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash;
  const isApprovedHostedOrigin =
    url.protocol === "https:" &&
    !url.port &&
    APPROVED_HOSTED_SUPABASE_ORIGINS.has(url.origin);
  const isLocalOrigin =
    (url.protocol === "http:" || url.protocol === "https:") &&
    LOCAL_SUPABASE_HOSTS.has(url.hostname);

  if (!hasCanonicalShape || (!isApprovedHostedOrigin && !isLocalOrigin)) {
    throw new Error("Refusing unapproved Supabase origin");
  }
}

export function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  if (
    supabasePublishableKey.trim() !== supabasePublishableKey ||
    isPrivilegedSupabaseKey(supabasePublishableKey)
  ) {
    throw new Error("Refusing privileged key in public Supabase configuration");
  }
  assertApprovedSupabaseUrl(supabaseUrl);

  return {
    publishableKey: supabasePublishableKey,
    url: supabaseUrl,
  };
}

export function getSupabasePrivilegedConfig() {
  return getSupabasePublicConfig();
}
