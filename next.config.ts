import type { NextConfig } from "next";

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseRemotePattern = configuredSupabaseUrl
  ? (() => {
      const url = new URL(configuredSupabaseUrl);
      return {
        hostname: url.hostname,
        pathname: "/storage/v1/object/public/camera-listings/**",
        port: url.port,
        protocol: url.protocol.slice(0, -1) as "http" | "https",
      };
    })()
  : undefined;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // The lifecycle accepts at most 5 MiB. Multipart framing needs a small
      // amount of headroom before application and database validation run.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: supabaseRemotePattern ? [supabaseRemotePattern] : [],
  },
  headers() {
    return [{ headers: securityHeaders, source: "/:path*" }];
  },
};

export default nextConfig;
