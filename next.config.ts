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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseRemotePattern ? [supabaseRemotePattern] : [],
  },
};

export default nextConfig;
