"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  ACCEPTED_ID_TYPES,
  verificationDeletionResponseSchema,
  verificationIntentResponseSchema,
  verificationPolicySchema,
  verificationStateSchema,
} from "./types";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const idTypeSchema = z.enum(ACCEPTED_ID_TYPES);

type UserContext = Awaited<ReturnType<typeof requireUser>>;
type UserSupabaseClient = UserContext["supabase"];
type AdminSupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

export type VerificationUploadActionState = {
  error?:
    | "consent_required"
    | "invalid_input"
    | "policy_unavailable"
    | "restart_required"
    | "suspended"
    | "upload_failed";
  fieldErrors?: { document?: string; idType?: string };
  status: "error" | "idle" | "success";
};

export type VerificationDeletionActionState = {
  error?: "delete_failed" | "invalid_input" | "legal_hold";
  result?: "deleted";
  status: "error" | "idle" | "success";
};

function isSupportedFileSignature(bytes: Buffer, mediaType: string) {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  return false;
}

async function prepareAndFinishIntentCleanup(
  admin: AdminSupabaseClient,
  storageClient: UserSupabaseClient,
  ownerUserId: string,
  intentId: string,
) {
  const prepared = await admin.schema("api").rpc(
    "prepare_verification_upload_cleanup",
    {
      p_actor_user_id: ownerUserId,
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: ownerUserId,
    },
  );
  const parsed = verificationIntentResponseSchema.safeParse(prepared.data);

  if (prepared.error || !parsed.success) return false;
  if (parsed.data.id && parsed.data.id !== intentId) return false;
  if (parsed.data.status === "cleaned") return true;
  if (parsed.data.status !== "cleanup_pending" || !parsed.data.object_path) {
    return false;
  }

  const removed = await storageClient.storage
    .from("verification-documents")
    .remove([parsed.data.object_path]);
  if (removed.error) return false;

  const finalized = await admin.schema("api").rpc(
    "finalize_verification_upload_cleanup",
    {
      p_actor_user_id: ownerUserId,
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: ownerUserId,
    },
  );

  return !finalized.error;
}

async function createUploadIntent(
  admin: AdminSupabaseClient,
  input: {
    byteSize: number;
    idType: (typeof ACCEPTED_ID_TYPES)[number];
    intentId: string;
    mediaType: string;
    ownerUserId: string;
    policyVersion: string;
    privacyNoticeVersion: string;
    sha256: string;
  },
) {
  return admin.schema("api").rpc("create_verification_upload_intent", {
    p_actor_user_id: input.ownerUserId,
    p_byte_size: input.byteSize,
    p_id_type: input.idType,
    p_intent_id: input.intentId,
    p_media_type: input.mediaType,
    p_operation_id: randomUUID(),
    p_owner_user_id: input.ownerUserId,
    p_policy_version: input.policyVersion,
    p_privacy_acknowledged: true,
    p_privacy_notice_version: input.privacyNoticeVersion,
    p_sha256_hex: input.sha256,
  });
}

async function reconcileFinalization(
  admin: AdminSupabaseClient,
  input: {
    byteSize: number;
    intentId: string;
    mediaType: string;
    ownerUserId: string;
    sha256: string;
  },
) {
  const finalize = () =>
    admin.schema("api").rpc("finalize_verification_upload", {
      p_actor_user_id: input.ownerUserId,
      p_intent_id: input.intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: input.ownerUserId,
      p_verified_byte_size: input.byteSize,
      p_verified_media_type: input.mediaType,
      p_verified_sha256_hex: input.sha256,
    });

  const first = await finalize();
  if (!first.error) return true;

  const read = await admin
    .schema("api")
    .rpc("get_verification_upload_intent", {
      p_intent_id: input.intentId,
      p_owner_user_id: input.ownerUserId,
    });
  const current = verificationIntentResponseSchema.safeParse(read.data);
  if (read.error || !current.success) return false;
  if (current.data.status === "finalized") return true;
  if (current.data.status !== "awaiting_upload") return false;

  const retry = await finalize();
  return !retry.error;
}

export async function submitVerificationEvidence(
  _state: VerificationUploadActionState,
  formData: FormData,
): Promise<VerificationUploadActionState> {
  const idType = idTypeSchema.safeParse(formData.get("idType"));
  const document = formData.get("document");

  if (!idType.success || !(document instanceof File)) {
    return {
      error: "invalid_input",
      fieldErrors: {
        document: document instanceof File ? undefined : "Choose a government ID file.",
        idType: idType.success ? undefined : "Choose an accepted government ID type.",
      },
      status: "error",
    };
  }
  if (formData.get("privacyConsent") !== "consent-government-id-processing") {
    return { error: "consent_required", status: "error" };
  }
  if (document.size < 1 || document.size > MAX_UPLOAD_BYTES) {
    return {
      error: "invalid_input",
      fieldErrors: { document: "Choose a non-empty file no larger than 5 MiB." },
      status: "error",
    };
  }

  const { supabase, user } = await requireUser();
  const policyResult = await supabase
    .schema("api")
    .rpc("get_verification_upload_policy");
  const policy = verificationPolicySchema.safeParse(policyResult.data);

  if (policyResult.error || !policy.success || !policy.data.enabled) {
    return { error: "policy_unavailable", status: "error" };
  }
  if (
    formData.get("policyVersion") !== policy.data.policy_version ||
    formData.get("privacyNoticeVersion") !== policy.data.privacy_notice_version
  ) {
    return { error: "policy_unavailable", status: "error" };
  }
  if (
    !policy.data.allowed_id_types.includes(idType.data) ||
    !policy.data.allowed_media_types.includes(
      document.type as (typeof policy.data.allowed_media_types)[number],
    ) ||
    document.size > policy.data.max_byte_size
  ) {
    return {
      error: "invalid_input",
      fieldErrors: { document: "Use an accepted JPEG or PNG no larger than 5 MiB." },
      status: "error",
    };
  }

  const bytes = Buffer.from(await document.arrayBuffer());
  if (!isSupportedFileSignature(bytes, document.type)) {
    return {
      error: "invalid_input",
      fieldErrors: { document: "The file contents do not match its JPEG or PNG type." },
      status: "error",
    };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const intentId = randomUUID();
  const intentInput = {
    byteSize: bytes.byteLength,
    idType: idType.data,
    intentId,
    mediaType: document.type,
    ownerUserId: user.id,
    policyVersion: policy.data.policy_version,
    privacyNoticeVersion: policy.data.privacy_notice_version,
    sha256,
  };

  let admin: AdminSupabaseClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { error: "policy_unavailable", status: "error" };
  }

  const expiry = await admin.schema("api").rpc("expire_due_verifications", {
    p_operation_id: randomUUID(),
  });
  if (expiry.error || !z.number().int().nonnegative().safeParse(expiry.data).success) {
    return { error: "restart_required", status: "error" };
  }

  let intentResult = await createUploadIntent(admin, intentInput);
  let intent = verificationIntentResponseSchema.safeParse(intentResult.data);

  if (intentResult.error?.code === "55000") {
    const stateResult = await supabase
      .schema("api")
      .rpc("get_my_verification_upload_state");
    const currentState = verificationStateSchema.safeParse(stateResult.data);
    const openIntentId = currentState.success ? currentState.data.intent?.id : undefined;

    if (
      !stateResult.error &&
      openIntentId &&
      (await prepareAndFinishIntentCleanup(
        admin,
        supabase,
        user.id,
        openIntentId,
      ))
    ) {
      intentResult = await createUploadIntent(admin, intentInput);
      intent = verificationIntentResponseSchema.safeParse(intentResult.data);
    }
  }

  if (
    !intentResult.error &&
    intent.success &&
    intent.data.status === "cleanup_pending" &&
    intent.data.id &&
    (await prepareAndFinishIntentCleanup(
      admin,
      supabase,
      user.id,
      intent.data.id,
    ))
  ) {
    intentResult = await createUploadIntent(admin, intentInput);
    intent = verificationIntentResponseSchema.safeParse(intentResult.data);
  }

  if (intentResult.error?.code === "42501") {
    return { error: "suspended", status: "error" };
  }
  if (intentResult.error || !intent.success) {
    return { error: "restart_required", status: "error" };
  }
  if (intent.data.status === "finalized") {
    revalidatePath("/account");
    return { status: "success" };
  }
  if (
    intent.data.status !== "awaiting_upload" ||
    !intent.data.id ||
    !intent.data.object_path
  ) {
    return { error: "restart_required", status: "error" };
  }

  const bucket = supabase.storage.from("verification-documents");
  const upload = await bucket.upload(intent.data.object_path, bytes, {
    cacheControl: "0",
    contentType: document.type,
    upsert: false,
  });
  const downloaded = await bucket.download(intent.data.object_path);

  if (downloaded.error || !downloaded.data) {
    await prepareAndFinishIntentCleanup(
      admin,
      supabase,
      user.id,
      intent.data.id,
    );
    return { error: upload.error ? "restart_required" : "upload_failed", status: "error" };
  }

  const storedBytes = Buffer.from(await downloaded.data.arrayBuffer());
  const storedSha256 = createHash("sha256").update(storedBytes).digest("hex");
  if (storedBytes.byteLength !== bytes.byteLength || storedSha256 !== sha256) {
    await prepareAndFinishIntentCleanup(
      admin,
      supabase,
      user.id,
      intent.data.id,
    );
    return { error: "upload_failed", status: "error" };
  }

  if (
    !(await reconcileFinalization(admin, {
      ...intentInput,
      intentId: intent.data.id,
    }))
  ) {
    await prepareAndFinishIntentCleanup(
      admin,
      supabase,
      user.id,
      intent.data.id,
    );
    return { error: "restart_required", status: "error" };
  }

  revalidatePath("/account");
  return { status: "success" };
}

export async function requestVerificationEvidenceDeletion(
  _state: VerificationDeletionActionState,
  formData: FormData,
): Promise<VerificationDeletionActionState> {
  const documentId = z.uuid().safeParse(formData.get("documentId"));
  if (!documentId.success) {
    return { error: "invalid_input", status: "error" };
  }

  const { supabase, user } = await requireUser();
  let admin: AdminSupabaseClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { error: "delete_failed", status: "error" };
  }
  const requested = await admin.schema("api").rpc(
    "request_verification_document_deletion",
    {
      p_actor_user_id: user.id,
      p_document_id: documentId.data,
      p_operation_id: randomUUID(),
      p_owner_user_id: user.id,
    },
  );
  const deletion = verificationDeletionResponseSchema.safeParse(requested.data);

  if (requested.error?.code === "55000") {
    return { error: "legal_hold", status: "error" };
  }
  if (requested.error || !deletion.success) {
    return { error: "delete_failed", status: "error" };
  }
  if (deletion.data.document_id !== documentId.data) {
    return { error: "delete_failed", status: "error" };
  }
  if (deletion.data.status === "deleted") {
    revalidatePath("/account");
    return { result: "deleted", status: "success" };
  }
  if (deletion.data.status === "scheduled") {
    return { error: "delete_failed", status: "error" };
  }
  if (!deletion.data.object_path) {
    return { error: "delete_failed", status: "error" };
  }

  await supabase.storage
    .from("verification-documents")
    .remove([deletion.data.object_path]);

  const finalize = () =>
    admin.schema("api").rpc("finalize_verification_document_deletion", {
      p_actor_user_id: user.id,
      p_document_id: documentId.data,
      p_operation_id: randomUUID(),
      p_owner_user_id: user.id,
    });
  const first = await finalize();
  const finalResult = first.error ? await finalize() : first;

  if (finalResult.error) {
    return { error: "delete_failed", status: "error" };
  }

  revalidatePath("/account");
  return { result: "deleted", status: "success" };
}
