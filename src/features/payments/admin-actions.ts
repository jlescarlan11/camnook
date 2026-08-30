"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stringFormValue } from "@/features/bookings/actions/state";
import {
  AdminAuthorizationRequiredError,
  isAuthenticationError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  PAYMENT_REJECTION_REASONS,
  paymentDecisionResponseSchema,
  paymentProofAccessGrantSchema,
} from "./types";

export type PaymentAccessActionState = {
  error?: "indeterminate" | "invalid" | "stale" | "unauthorized" | "unavailable";
  expiresAt?: string;
  signedUrl?: string;
  status: "error" | "idle" | "success";
};

export type GcashConfigurationActionState = {
  error?: "indeterminate" | "invalid" | "unauthorized";
  fieldErrors?: {
    recipientAccount?: string;
    recipientName?: string;
  };
  status: "error" | "idle" | "success";
  version?: number;
};

export type PaymentDecisionActionState = {
  action?: "reject" | "verify";
  bookingState?: "CONFIRMED" | "EXPIRED" | "TO_PAY";
  error?: "duplicate" | "indeterminate" | "invalid" | "stale" | "unauthorized" | "unavailable";
  fieldErrors?: {
    actualAccount?: string;
    observedAmount?: string;
    observedReference?: string;
    rejectionReasonCode?: string;
  };
  status: "error" | "idle" | "success";
};

const paymentIdSchema = z.uuid();
const observedReferenceSchema = z
  .string()
  .trim()
  .min(4)
  .max(120)
  .regex(/^[A-Za-z0-9 -]+$/);
const recipientNameSchema = z.string().trim().min(2).max(160);
const recipientAccountSchema = z
  .string()
  .trim()
  .regex(/^(09[0-9]{9}|\+639[0-9]{9})$/);

export async function configureGcashRecipient(
  _state: GcashConfigurationActionState,
  formData: FormData,
): Promise<GcashConfigurationActionState> {
  const recipientName = recipientNameSchema.safeParse(
    stringFormValue(formData, "recipientName"),
  );
  const recipientAccount = recipientAccountSchema.safeParse(
    stringFormValue(formData, "recipientAccount"),
  );
  const fieldErrors: GcashConfigurationActionState["fieldErrors"] = {};

  if (!recipientName.success) {
    fieldErrors.recipientName = "Enter the approved recipient name.";
  }
  if (!recipientAccount.success) {
    fieldErrors.recipientAccount =
      "Enter an 11-digit 09 GCash number or +639 number.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "invalid", fieldErrors, status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      error: isAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const result = await context.supabase
      .schema("api")
      .rpc("configure_gcash_recipient", {
        p_enabled: true,
        p_operation_id: randomUUID(),
        p_recipient_account: recipientAccount.data!,
        p_recipient_name: recipientName.data!,
      });
    const committed = z
      .object({ enabled: z.literal(true), version: z.number().int().positive() })
      .strict()
      .safeParse(result.data);

    if (result.error || !committed.success) {
      return {
        error:
          result.error?.code === "42501"
            ? "unauthorized"
            : result.error?.code === "22023"
              ? "invalid"
              : "indeterminate",
        status: "error",
      };
    }

    revalidatePath("/admin");
    revalidatePath("/account");
    return { status: "success", version: committed.data.version };
  } catch {
    return { error: "indeterminate", status: "error" };
  }
}

function isAuthorizationDenial(error: unknown) {
  return (
    isAuthenticationError(error) ||
    error instanceof AdminAuthorizationRequiredError
  );
}

function parseAmount(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(Math.round(amount * 100)) && amount > 0
    ? amount
    : null;
}

function mapProviderError(error: { code?: string } | null) {
  if (!error) return "indeterminate" as const;
  if (error.code === "42501") return "unauthorized" as const;
  if (error.code === "P0001" || error.code === "40001") {
    return "stale" as const;
  }
  if (error.code === "P0002") return "unavailable" as const;
  if (error.code === "22023" || error.code === "23514") {
    return "invalid" as const;
  }
  if (error.code === "23505") return "duplicate" as const;
  return "indeterminate" as const;
}

function isSafeSignedUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function revalidatePaymentViews(paymentId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/payments/${paymentId}`);
  revalidatePath("/account");
}

export async function requestPaymentProofAccess(
  _state: PaymentAccessActionState,
  formData: FormData,
): Promise<PaymentAccessActionState> {
  const paymentId = stringFormValue(formData, "paymentId");
  if (!paymentIdSchema.safeParse(paymentId).success) {
    return { error: "invalid", status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      error: isAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await admin
      .schema("api")
      .rpc("authorize_payment_proof_access", {
        p_actor_user_id: context.user.id,
        p_operation_id: randomUUID(),
        p_payment_id: paymentId,
        p_purpose: "payment_reconciliation",
      });
    const grant = paymentProofAccessGrantSchema.safeParse(result.data);

    if (result.error) {
      const mapped = mapProviderError(result.error);
      return {
        error: mapped === "duplicate" ? "indeterminate" : mapped,
        status: "error",
      };
    }
    if (!grant.success || grant.data.transaction_id !== paymentId) {
      return { error: "indeterminate", status: "error" };
    }

    const signed = await admin.storage
      .from("payment-proofs")
      .createSignedUrl(grant.data.object_path, grant.data.expires_in_seconds);

    if (
      signed.error ||
      !signed.data?.signedUrl ||
      !isSafeSignedUrl(signed.data.signedUrl)
    ) {
      return { error: "unavailable", status: "error" };
    }

    return {
      expiresAt: new Date(
        Date.now() + grant.data.expires_in_seconds * 1000,
      ).toISOString(),
      signedUrl: signed.data.signedUrl,
      status: "success",
    };
  } catch {
    return { error: "indeterminate", status: "error" };
  }
}

export async function decidePayment(
  _state: PaymentDecisionActionState,
  formData: FormData,
): Promise<PaymentDecisionActionState> {
  const paymentId = stringFormValue(formData, "paymentId");
  const decision = stringFormValue(formData, "decision");
  const observedAmountValue = stringFormValue(formData, "observedAmount");
  const observedAmount = parseAmount(observedAmountValue);
  const observedReference = observedReferenceSchema.safeParse(
    stringFormValue(formData, "observedReference"),
  );
  const rejectionReasonCode = stringFormValue(
    formData,
    "rejectionReasonCode",
  );
  const action = decision === "rejected" ? "reject" : "verify";
  const fieldErrors: PaymentDecisionActionState["fieldErrors"] = {};

  if (!paymentIdSchema.safeParse(paymentId).success) {
    return { action, error: "invalid", status: "error" };
  }

  if (decision === "verified") {
    if (formData.get("actualAccount") !== "confirmed-actual-account") {
      fieldErrors.actualAccount =
        "Confirm the transfer in the approved GCash account, not from the screenshot alone.";
    }
    if (observedAmount === null) {
      fieldErrors.observedAmount = "Enter the amount observed in GCash.";
    }
    if (!observedReference.success) {
      fieldErrors.observedReference =
        "Enter the reference observed in the approved GCash account.";
    }
  } else if (decision === "rejected") {
    if (
      !z.enum(PAYMENT_REJECTION_REASONS).safeParse(rejectionReasonCode).success
    ) {
      fieldErrors.rejectionReasonCode = "Choose a renter-safe reason.";
    }
  } else {
    return { action, error: "invalid", status: "error" };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { action, fieldErrors, status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      action,
      error: isAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const operationId = randomUUID();
    const result =
      decision === "verified"
        ? await context.supabase.schema("api").rpc("verify_payment", {
            p_actual_account_checked: true,
            p_observed_amount: observedAmount!,
            p_observed_reference: observedReference.data!,
            p_operation_id: operationId,
            p_payment_id: paymentId,
          })
        : await context.supabase.schema("api").rpc("reject_payment", {
            p_operation_id: operationId,
            p_payment_id: paymentId,
            p_reason_code: rejectionReasonCode,
          });

    revalidatePaymentViews(paymentId);
    if (result.error) {
      return {
        action,
        error: mapProviderError(result.error),
        status: "error",
      };
    }

    const committed = paymentDecisionResponseSchema.safeParse(result.data);
    if (
      !committed.success ||
      committed.data.transaction_id !== paymentId ||
      committed.data.status !== decision
    ) {
      return { action, error: "indeterminate", status: "error" };
    }

    return {
      action,
      bookingState: committed.data.booking_state,
      status: "success",
    };
  } catch {
    revalidatePaymentViews(paymentId);
    return { action, error: "indeterminate", status: "error" };
  }
}
