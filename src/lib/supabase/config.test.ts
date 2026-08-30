import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupabasePrivilegedConfig,
  getSupabasePublicConfig,
} from "./config";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function configure(url: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

describe("Supabase configuration boundaries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalPublishableKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
    }
    if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it.each([
    "https://ekmoiepalelqpmemvrkl.supabase.co",
    "https://iegcixcevvkryfwfotqz.supabase.co",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
    "http://localhost:54321",
  ])("allows the approved privileged origin %s", (url) => {
    configure(url);

    expect(getSupabasePrivilegedConfig()).toEqual({
      publishableKey: "publishable-test-key",
      url,
    });
  });

  it.each([
    "https://attacker.example",
    "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    "http://iegcixcevvkryfwfotqz.supabase.co",
    "https://iegcixcevvkryfwfotqz.supabase.co:8443",
    "https://user:password@iegcixcevvkryfwfotqz.supabase.co",
    "https://iegcixcevvkryfwfotqz.supabase.co/rest/v1",
    "https://iegcixcevvkryfwfotqz.supabase.co?redirect=attacker",
    "http://localhost:8000",
    "https://localhost:54321",
    "http://127.0.0.1:54322",
    "http://[::1]:54322",
  ])("rejects the unapproved privileged URL %s", (url) => {
    configure(url);

    expect(() => getSupabasePublicConfig()).toThrow(
      /Refusing (invalid Supabase URL|unapproved Supabase origin)/,
    );
    expect(() => getSupabasePrivilegedConfig()).toThrow(
      /Refusing (invalid Supabase URL|unapproved Supabase origin)/,
    );
  });

  it("requires both browser-visible values", () => {
    configure("https://ekmoiepalelqpmemvrkl.supabase.co");

    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getSupabasePublicConfig()).toThrow(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it.each([
    "sb_secret_accidentally_public",
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
      JSON.stringify({ role: "service_role" }),
    ).toString("base64url")}.synthetic-signature`,
    " publishable-key-with-whitespace",
  ])("rejects a privileged or malformed browser key", (publishableKey) => {
    configure("https://ekmoiepalelqpmemvrkl.supabase.co");
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;

    expect(() => getSupabasePublicConfig()).toThrow(
      "Refusing privileged key in public Supabase configuration",
    );
  });

  it("continues to accept a legacy anon JWT", () => {
    configure("https://ekmoiepalelqpmemvrkl.supabase.co");
    const anonKey = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
      JSON.stringify({ role: "anon" }),
    ).toString("base64url")}.synthetic-signature`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;

    expect(getSupabasePublicConfig().publishableKey).toBe(anonKey);
  });
});
