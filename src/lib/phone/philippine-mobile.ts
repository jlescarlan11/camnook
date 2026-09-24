import { z } from "zod";

/** The canonical format used for newly saved Philippine mobile numbers. */
export function normalizePhilippineMobile(raw: string): string | null {
  const value = raw.trim();
  if (!/^[+]?\d[\d\s()-]*$/.test(value)) return null;
  const compact = value.replace(/[\s()-]/g, "");
  const national = compact.startsWith("+63") ? compact.slice(3)
    : compact.startsWith("63") ? compact.slice(2)
      : compact.startsWith("0") ? compact.slice(1) : compact;
  return /^9\d{9}$/.test(national) ? `+63${national}` : null;
}

/** Convert saved values and browser autofill/paste to the editable part. */
export function mobileInputDigits(raw: string): string {
  const normalized = normalizePhilippineMobile(raw);
  if (normalized) return normalized.slice(3);
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length > 10) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export const philippineMobileSchema = z.string().trim()
  .refine((value) => normalizePhilippineMobile(value) !== null)
  .transform((value) => normalizePhilippineMobile(value)!);
