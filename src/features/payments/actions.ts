"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stringFormValue } from "@/features/bookings/actions/state";
import { requireUser } from "@/lib/auth/require-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  PAYMENT_MEDIA_TYPES,
  paymentProofIntentResponseSchema,
  paymentProofPolicySchema,
  paymentSubmissionResponseSchema,
} from "./types";

const bookingIdSchema = z.uuid();
const attemptIdSchema = z.uuid();
const referenceSchema = z
  .string()
  .trim()
  .min(4)
  .max(120)
  .regex(/^[A-Za-z0-9 -]+$/);

type UserContext = Awaited<ReturnType<typeof requireUser>>;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type PaymentActionState = {
  error?:
    | "indeterminate"
    | "invalid"
    | "proof_failed"
    | "recipient_unavailable"
    | "stale"
    | "unauthorized";
  fieldErrors?: {
    proof?: string;
    reference?: string;
  };
  result?: "accepted" | "proof_saved";
  status: "error" | "idle" | "success";
  transactionId?: string;
};

function hasSupportedSignature(bytes: Buffer, mediaType: string) {
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

function revalidatePaymentViews(bookingId: string, transactionId?: string) {
  revalidatePath("/account");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/admin");
  if (transactionId) revalidatePath(`/admin/payments/${transactionId}`);
}

async function cleanupIntent(
  admin: AdminClient,
  context: UserContext,
  intentId: string,
) {
  const prepared = await admin.schema("api").rpc(
    "prepare_payment_proof_upload_cleanup",
    {
      p_actor_user_id: context.user.id,
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: context.user.id,
    },
  );
  const parsed = paymentProofIntentResponseSchema.safeParse(prepared.data);
  if (prepared.error || !parsed.success) return false;
  if (parsed.data.id && parsed.data.id !== intentId) return false;
  if (parsed.data.status === "cleaned" || parsed.data.status === "expired") {
    return true;
  }
  if (parsed.data.status !== "cleanup_pending" || !parsed.data.object_path) {
    return false;
  }

  const removed = await context.supabase.storage
    .from("payment-proofs")
    .remove([parsed.data.object_path]);
  if (removed.error) return false;

  const finalized = await admin.schema("api").rpc(
    "finalize_payment_proof_upload_cleanup",
    {
      p_actor_user_id: context.user.id,
      p_intent_id: intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: context.user.id,
    },
  );
  return !finalized.error;
}

async function createProofIntent(
  admin: AdminClient,
  context: UserContext,
  input: {
    byteSize: number;
    intentId: string;
    mediaType: string;
    sha256: string;
    transactionId: string;
  },
) {
  return admin.schema("api").rpc("create_payment_proof_upload_intent", {
    p_actor_user_id: context.user.id,
    p_byte_size: input.byteSize,
    p_intent_id: input.intentId,
    p_media_type: input.mediaType,
    p_operation_id: randomUUID(),
    p_owner_user_id: context.user.id,
    p_sha256_hex: input.sha256,
    p_transaction_id: input.transactionId,
  });
}

async function finalizeProof(
  admin: AdminClient,
  context: UserContext,
  input: {
    byteSize: number;
    intentId: string;
    mediaType: string;
    sha256: string;
  },
) {
  const finalize = () =>
    admin.schema("api").rpc("finalize_payment_proof_upload", {
      p_actor_user_id: context.user.id,
      p_intent_id: input.intentId,
      p_operation_id: randomUUID(),
      p_owner_user_id: context.user.id,
      p_verified_byte_size: input.byteSize,
      p_verified_media_type: input.mediaType,
      p_verified_sha256_hex: input.sha256,
    });

  const first = await finalize();
  if (!first.error) return true;

  const read = await admin.schema("api").rpc("get_payment_proof_upload_intent", {
    p_intent_id: input.intentId,
    p_owner_user_id: context.user.id,
  });
  const current = paymentProofIntentResponseSchema.safeParse(read.data);
  if (read.error || !current.success) return false;
  if (current.data.status === "finalized") return true;
  if (current.data.status !== "awaiting_upload") return false;

  const retry = await finalize();
  return !retry.error;
}

async function storePaymentProof(
  context: UserContext,
  transactionId: string,
  proof: File,
): Promise<"invalid" | "saved" | "unavailable"> {
  const policyResult = await context.supabase
    .schema("api")
    .rpc("get_payment_proof_policy");
  const policy = paymentProofPolicySchema.safeParse(policyResult.data);

  if (policyResult.error || !policy.success) return "unavailable";
  if (
    proof.size < 1 ||
    proof.size > policy.data.max_byte_size ||
    !policy.data.allowed_media_types.includes(
      proof.type as (typeof PAYMENT_MEDIA_TYPES)[number],
    )
  ) {
    return "invalid";
  }

  const bytes = Buffer.from(await proof.arrayBuffer());
  if (!hasSupportedSignature(bytes, proof.type)) return "invalid";

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const intentInput = {
    byteSize: bytes.byteLength,
    intentId: randomUUID(),
    mediaType: proof.type,
    sha256,
    transactionId,
  };

  let admin: AdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return "unavailable";
  }

  let intentResult = await createProofIntent(admin, context, intentInput);
  let intent = paymentProofIntentResponseSchema.safeParse(intentResult.data);

  if (
    !intentResult.error &&
    intent.success &&
    intent.data.status === "cleanup_pending" &&
    intent.data.id &&
    (await cleanupIntent(admin, context, intent.data.id))
  ) {
    intentInput.intentId = randomUUID();
    intentResult = await createProofIntent(admin, context, intentInput);
    intent = paymentProofIntentResponseSchema.safeParse(intentResult.data);
  }

  if (intentResult.error || !intent.success) return "unavailable";
  if (intent.data.status === "finalized") return "saved";
  if (
    intent.data.status !== "awaiting_upload" ||
    !intent.data.id ||
    !intent.data.object_path
  ) {
    return "unavailable";
  }

  await context.supabase.storage
    .from("payment-proofs")
    .upload(intent.data.object_path, bytes, {
      cacheControl: "0",
      contentType: proof.type,
      upsert: false,
    });

  // A retry can encounter the exact immutable object written by an earlier
  // request whose finalize response was interrupted. Reconcile the stored
  // bytes before treating a no-overwrite upload error as a failed attempt.
  const downloaded = await admin.storage
    .from("payment-proofs")
    .download(intent.data.object_path);
  if (downloaded.error || !downloaded.data) {
    await cleanupIntent(admin, context, intent.data.id);
    return "unavailable";
  }

  const storedBytes = Buffer.from(await downloaded.data.arrayBuffer());
  const storedSha256 = createHash("sha256").update(storedBytes).digest("hex");
  if (storedBytes.byteLength !== bytes.byteLength || storedSha256 !== sha256) {
    await cleanupIntent(admin, context, intent.data.id);
    return "unavailable";
  }

  if (!(await finalizeProof(admin, context, { ...intentInput, intentId: intent.data.id }))) {
    await cleanupIntent(admin, context, intent.data.id);
    return "unavailable";
  }

  return "saved";
}

function validateProofInput(value: FormDataEntryValue | null) {
  if (
    value === null ||
    value === "" ||
    (value instanceof File && value.size === 0)
  ) {
    return { proof: null } as const;
  }
  if (!(value instanceof File)) {
    return { error: "Choose a non-empty JPEG or PNG proof." } as const;
  }
  if (value.size > 5 * 1024 * 1024) {
    return { error: "Choose a JPEG or PNG no larger than 5 MiB." } as const;
  }
  return { proof: value } as const;
}

export async function submitPayment(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const attemptId = stringFormValue(formData, "attemptId");
  const reference = referenceSchema.safeParse(
    stringFormValue(formData, "reference"),
  );
  const proofInput = validateProofInput(formData.get("proof"));
  const fieldErrors: PaymentActionState["fieldErrors"] = {};

  if (!bookingIdSchema.safeParse(bookingId).success) {
    return { error: "invalid", status: "error" };
  }
  if (!attemptIdSchema.safeParse(attemptId).success) {
    return { error: "invalid", status: "error" };
  }
  if (!reference.success) {
    fieldErrors.reference = "Enter the 4–120 character GCash reference.";
  }
  if ("error" in proofInput || !proofInput.proof) {
    fieldErrors.proof =
      "Upload a non-empty JPEG or PNG transfer proof no larger than 5 MiB.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "invalid", fieldErrors, status: "error" };
  }

  let context: UserContext;
  try {
    context = await requireUser();
  } catch {
    return { error: "unauthorized", status: "error" };
  }

  const result = await context.supabase.schema("api").rpc("submit_payment", {
    p_attempt_id: attemptId,
    p_booking_id: bookingId,
    p_reference: reference.data!,
  });
  const payment = paymentSubmissionResponseSchema.safeParse(result.data);

  if (result.error) {
    revalidatePaymentViews(bookingId);
    if (result.error.code === "42501") {
      return { error: "unauthorized", status: "error" };
    }
    if (result.error.code === "22023") {
      return { error: "invalid", status: "error" };
    }
    if (result.error.code === "40001" || result.error.code === "P0002") {
      return { error: "stale", status: "error" };
    }
    if (result.error.code === "55000") {
      return { error: "recipient_unavailable", status: "error" };
    }
    return { error: "indeterminate", status: "error" };
  }
  if (!payment.success || payment.data.booking_state !== "PAYMENT_REVIEW") {
    revalidatePaymentViews(bookingId);
    return { error: "indeterminate", status: "error" };
  }

  const proofResult = await storePaymentProof(
    context,
    payment.data.transaction_id,
    proofInput.proof!,
  );
  revalidatePaymentViews(bookingId, payment.data.transaction_id);
  if (proofResult !== "saved") {
    return {
      error: "proof_failed",
      status: "error",
      transactionId: payment.data.transaction_id,
    };
  }

  return {
    result: "accepted",
    status: "success",
    transactionId: payment.data.transaction_id,
  };
}

export async function uploadPaymentProof(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const bookingId = stringFormValue(formData, "bookingId");
  const transactionId = stringFormValue(formData, "transactionId");
  const proofInput = validateProofInput(formData.get("proof"));

  if (
    !bookingIdSchema.safeParse(bookingId).success ||
    !z.uuid().safeParse(transactionId).success
  ) {
    return { error: "invalid", status: "error" };
  }
  if ("error" in proofInput || !proofInput.proof) {
    return {
      error: "invalid",
      fieldErrors: {
        proof: "Choose a non-empty JPEG or PNG no larger than 5 MiB.",
      },
      status: "error",
    };
  }

  let context: UserContext;
  try {
    context = await requireUser();
  } catch {
    return { error: "unauthorized", status: "error" };
  }

  const stored = await storePaymentProof(context, transactionId, proofInput.proof);
  revalidatePaymentViews(bookingId, transactionId);

  if (stored === "invalid") {
    return {
      error: "invalid",
      fieldErrors: {
        proof: "The file contents must be a JPEG or PNG no larger than 5 MiB.",
      },
      status: "error",
    };
  }
  if (stored !== "saved") {
    return { error: "proof_failed", status: "error", transactionId };
  }

  return { result: "proof_saved", status: "success", transactionId };
}
