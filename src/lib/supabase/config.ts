const APPROVED_HOSTED_SUPABASE_ORIGINS = new Set([
  "https://ekmoiepalelqpmemvrkl.supabase.co",
  "https://iegcixcevvkryfwfotqz.supabase.co",
]);
const LOCAL_SUPABASE_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

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

  return {
    publishableKey: supabasePublishableKey,
    url: supabaseUrl,
  };
}

export function getSupabasePrivilegedConfig() {
  const config = getSupabasePublicConfig();
  let url: URL;

  try {
    url = new URL(config.url);
  } catch {
    throw new Error("Refusing invalid privileged Supabase URL");
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
    throw new Error("Refusing unapproved privileged Supabase origin");
  }

  return config;
}
