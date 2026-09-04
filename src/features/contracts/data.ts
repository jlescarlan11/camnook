import "server-only";

import { z } from "zod";

const accessorySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});

const contractSnapshotSchema = z.object({
  booking: z.object({
    expected_location: z.string().min(1),
    id: z.uuid(),
    intended_use: z.string().min(1),
    pickup_at: z.string().min(1),
    return_at: z.string().min(1),
  }),
  camera: z.object({
    accessories: z.array(accessorySchema),
    id: z.uuid(),
    name: z.string().min(1),
    serial_number: z.string().min(1),
  }),
  meetup: z
    .union([
      z.object({
        kind: z.literal("public_venue").default("public_venue"),
      attribution: z.literal("© OpenStreetMap contributors · Powered by Geoapify"),
      provider: z.literal("geoapify"),
      provider_config_version: z.string().min(1),
      renter_city: z.string().min(2),
      venue_address: z.string().min(2),
      venue_city: z.string().min(2),
      venue_latitude: z.coerce.number().min(-90).max(90),
      venue_longitude: z.coerce.number().min(-180).max(180),
      venue_name: z.string().min(2),
      }),
      z.object({
        kind: z.literal("canonical_area"),
        area_code: z.string().regex(/^\d{9}$/),
        area_label: z.string().min(2),
        area_release: z.string().min(1),
        renter_city: z.string().min(2),
      }),
    ])
    .optional(),
  pricing: z.object({
    billable_days: z.number().int().positive(),
    currency: z.literal("PHP"),
    daily_rate: z.number().nonnegative(),
    rental_amount: z.number().nonnegative(),
    security_deposit: z.number().nonnegative(),
    total_due: z.number().nonnegative(),
  }),
  renter: z.object({
    legal_name: z.string().min(1),
    phone: z.string().min(1),
  }),
  template: z.object({
    content_sha256: z.string().length(64),
    id: z.uuid(),
    schema_version: z.number().int().positive(),
    terms: z.object({
      cancellation: z.unknown(),
      damage: z.unknown(),
      loss: z.unknown(),
      "late-return": z.unknown(),
      "non-transferability": z.unknown(),
      pickup: z.unknown(),
      return: z.unknown(),
    }),
    version: z.string().min(1),
  }),
});

const versionRowSchema = z.object({
  booking_id: z.uuid(),
  id: z.uuid(),
  issued_at: z.string().min(1),
  snapshot: contractSnapshotSchema,
  status: z.enum(["issued", "superseded", "voided"]),
  supersedes_id: z.uuid().nullable(),
  version_no: z.number().int().positive(),
});

const contractHistorySnapshotSchema = z.array(versionRowSchema.extend({
  signature: z.object({
    id: z.uuid(),
    signed_at: z.string().min(1),
  }).nullable(),
}));

const auditRowSchema = z.object({
  action: z.string().min(1),
  actor_type: z.enum(["renter", "admin", "system"]),
  actor_user_id: z.uuid().nullable(),
  audit_id: z.number().int().positive(),
  contract_version_id: z.uuid(),
  occurred_at: z.string().min(1),
  outcome: z.string().min(1),
  version_no: z.number().int().positive(),
});

const adminContractContextSchema = z.object({
  audit: z.array(auditRowSchema),
  cameras: z.array(z.object({
    id: z.uuid(),
    name: z.string().min(1),
  })),
  versions: contractHistorySnapshotSchema,
});

export type ContractVersionDTO = {
  id: string;
  issuedAt: string;
  signature: { id: string; signedAt: string } | null;
  snapshot: z.infer<typeof contractSnapshotSchema>;
  status: z.infer<typeof versionRowSchema>["status"];
  supersedesId: string | null;
  versionNo: number;
};

export type ContractHistoryDTO = {
  current: ContractVersionDTO;
  versions: ContractVersionDTO[];
};

export function projectContractHistorySnapshot(
  value: unknown,
  currentContractVersionId: string,
) {
  const parsed = contractHistorySnapshotSchema.safeParse(value);
  if (!parsed.success) return { status: "error" } as const;

  const versions = parsed.data.map((version) => ({
    id: version.id,
    issuedAt: version.issued_at,
    signature: version.signature
      ? { id: version.signature.id, signedAt: version.signature.signed_at }
      : null,
    snapshot: version.snapshot,
    status: version.status,
    supersedesId: version.supersedes_id,
    versionNo: version.version_no,
  }));
  const current = versions.find(
    (version) => version.id === currentContractVersionId,
  );
  if (!current) return { status: "inconsistent" } as const;

  return { agreement: { current, versions }, status: "success" } as const;
}

export function projectAdminContractContext(
  value: unknown,
  currentContractVersionId: string,
) {
  const contextData = adminContractContextSchema.safeParse(value);
  if (!contextData.success) return { status: "error" } as const;

  const agreement = projectContractHistorySnapshot(
    contextData.data.versions,
    currentContractVersionId,
  );
  if (agreement.status !== "success") return agreement;

  return {
    agreement: agreement.agreement,
    cameras: contextData.data.cameras,
    events: contextData.data.audit.map((row) => ({
      action: row.action,
      actorType: row.actor_type,
      actorUserId: row.actor_user_id,
      auditId: row.audit_id,
      contractVersionId: row.contract_version_id,
      occurredAt: row.occurred_at,
      outcome: row.outcome,
      versionNo: row.version_no,
    })),
    status: "success",
  } as const;
}
