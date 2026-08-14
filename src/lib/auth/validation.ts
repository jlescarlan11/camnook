import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

export const emailOtpSchema = z.string().trim().regex(/^\d{6}$/);

export const captchaTokenSchema = z.string().trim().min(1).max(4096);

export function stringFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
