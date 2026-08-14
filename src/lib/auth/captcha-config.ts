import "server-only";

export function getTurnstileSiteKey() {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

export function isTurnstileConfigured() {
  return getTurnstileSiteKey() !== null;
}
