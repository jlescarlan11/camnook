import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const claimsSchema = z.object({
  actorId: z.uuid(),
  cameraId: z.uuid(),
  city: z.object({
    countryCode: z.literal("PH"),
    label: z.string().trim().min(2).max(120),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    providerCityId: z.string().trim().min(2).max(240),
  }),
  configVersion: z.string().trim().min(1).max(64),
  expectedVersion: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
});

export type HandoffCityReferenceClaims = z.infer<typeof claimsSchema>;

function keyFromSecret(secret: string) {
  if (secret.length < 32) throw new Error("invalid_reference_secret");
  return createHash("sha256").update(secret).digest();
}

export function mintHandoffCityReference(
  claims: HandoffCityReferenceClaims,
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
    "handoff-city-v1",
    initializationVector.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function readHandoffCityReference(
  reference: string,
  secret: string,
  expected: {
    actorId: string;
    cameraId: string;
    configVersion: string;
    expectedVersion: number;
    now?: Date;
  },
): HandoffCityReferenceClaims | null {
  try {
    if (reference.length > 4_096) return null;
    const [version, iv, encrypted, authenticationTag, extra] =
      reference.split(".");
    if (
      version !== "handoff-city-v1" ||
      !iv ||
      !encrypted ||
      !authenticationTag ||
      extra
    ) {
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
    if (!parsed.success) return null;
    if (
      parsed.data.actorId !== expected.actorId ||
      parsed.data.cameraId !== expected.cameraId ||
      parsed.data.configVersion !== expected.configVersion ||
      parsed.data.expectedVersion !== expected.expectedVersion ||
      new Date(parsed.data.expiresAt) <= (expected.now ?? new Date())
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
