import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const claimsSchema = z.object({
  address: z.string().trim().min(1).max(300),
  binding: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
  configVersion: z.string().trim().min(1).max(64),
  expiresAt: z.string().datetime(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  name: z.string().trim().min(1).max(200),
  renterCity: z.object({
    label: z.string().trim().min(1).max(120),
  }),
  routingPolicyVersion: z.string().trim().min(1).max(64),
});

export type RecommendationReferenceClaims = z.infer<typeof claimsSchema>;

function keyFromSecret(secret: string) {
  if (secret.length < 32) throw new Error("invalid_reference_secret");
  return createHash("sha256").update(secret).digest();
}

export function mintRecommendationReference(
  claims: RecommendationReferenceClaims,
  secret: string,
) {
  const validated = claimsSchema.parse(claims);
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    initializationVector,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(validated), "utf8"),
    cipher.final(),
  ]);
  return [
    "v2",
    initializationVector.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function readRecommendationReference(
  reference: string,
  secret: string,
  options: { binding: string; now?: Date },
): RecommendationReferenceClaims | null {
  try {
    if (reference.length > 4_096) return null;
    const [version, iv, encrypted, authenticationTag, extra] =
      reference.split(".");
    if (version !== "v2" || !iv || !encrypted || !authenticationTag || extra) {
      return null;
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFromSecret(secret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = claimsSchema.safeParse(JSON.parse(plaintext));
    if (!parsed.success || parsed.data.binding !== options.binding) return null;
    if (new Date(parsed.data.expiresAt) <= (options.now ?? new Date())) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
