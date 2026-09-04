import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const recommendationClaimsSchema = z.object({
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

const canonicalAreaClaimsSchema = z.object({
  areaCode: z.string().regex(/^\d{10}$/),
  areaLabel: z.string().trim().min(1).max(160),
  binding: z.string().trim().min(1).max(300),
  expiresAt: z.string().datetime(),
  kind: z.literal("canonical_area"),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
});

export type RecommendationReferenceClaims = z.infer<
  typeof recommendationClaimsSchema
>;
export type CanonicalAreaReferenceClaims = z.infer<
  typeof canonicalAreaClaimsSchema
>;

function keyFromSecret(secret: string) {
  if (secret.length < 32) throw new Error("invalid_reference_secret");
  return createHash("sha256").update(secret).digest();
}

export function mintRecommendationReference(
  claims: RecommendationReferenceClaims,
  secret: string,
) {
  const validated = recommendationClaimsSchema.parse(claims);
  return encryptReference("v2", validated, secret);
}

export function mintCanonicalAreaReference(
  claims: CanonicalAreaReferenceClaims,
  secret: string,
) {
  const validated = canonicalAreaClaimsSchema.parse(claims);
  return encryptReference("v3", validated, secret);
}

function encryptReference(
  version: "v2" | "v3",
  claims: RecommendationReferenceClaims | CanonicalAreaReferenceClaims,
  secret: string,
) {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    initializationVector,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(claims), "utf8"),
    cipher.final(),
  ]);
  return [
    version,
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
    const parsed = recommendationClaimsSchema.safeParse(JSON.parse(plaintext));
    if (!parsed.success || parsed.data.binding !== options.binding) return null;
    if (new Date(parsed.data.expiresAt) <= (options.now ?? new Date())) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function readCanonicalAreaReference(
  reference: string,
  secret: string,
  options: { binding: string; now?: Date },
): CanonicalAreaReferenceClaims | null {
  try {
    if (reference.length > 4_096) return null;
    const [version, iv, encrypted, authenticationTag, extra] =
      reference.split(".");
    if (version !== "v3" || !iv || !encrypted || !authenticationTag || extra) {
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
    const parsed = canonicalAreaClaimsSchema.safeParse(JSON.parse(plaintext));
    if (!parsed.success || parsed.data.binding !== options.binding) return null;
    if (new Date(parsed.data.expiresAt) <= (options.now ?? new Date())) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
