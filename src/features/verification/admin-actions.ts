"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationRequiredError,
  isAuthenticationError,
  requireAdmin,
} from "@/lib/auth/require-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { stringFormValue } from "../bookings/actions/state";
import { isIsoCalendarDate, manilaBusinessDate } from "./admin-date";
import {
  ACCEPTED_ID_TYPES,
  VERIFICATION_REJECTION_REASONS,
  verificationDecisionResponseSchema,
  verificationEvidenceAccessGrantSchema,
} from "./types";

export type VerificationAccessActionState = {
  documentId?: string;
  error?: "indeterminate" | "invalid" | "stale" | "unauthorized" | "unavailable";
  expiresAt?: string;
  signedUrl?: string;
  status: "error" | "idle" | "success";
};

export type VerificationDecisionActionState = {
  action?: "reject" | "verify";
  error?: "indeterminate" | "invalid" | "stale" | "unauthorized" | "unavailable";
  fieldErrors?: {
    approvedIdType?: string;
    documentExpirationDate?: string;
    recordId?: string;
    rejectionReasonCode?: string;
    reviewedDocumentId?: string;
  };
  status: "error" | "idle" | "success";
};

const recordIdSchema = z.uuid({ error: "This verification reference is invalid." });

function isKnownAuthorizationDenial(error: unknown) {
  return (
    isAuthenticationError(error) ||
    error instanceof AdminAuthorizationRequiredError
  );
}

function revalidateVerificationViews(recordId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/verifications/${recordId}`);
  revalidatePath("/account");
}

function mapProviderError(error: { code?: string; message?: string } | null) {
  if (!error) return "indeterminate" as const;
  if (error.code === "42501") return "unauthorized" as const;
  if (error.code === "P0001") return "stale" as const;
  if (error.code === "P0002") return "unavailable" as const;
  if (error.code === "22023") return "invalid" as const;
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

export async function requestVerificationEvidenceAccess(
  _state: VerificationAccessActionState,
  formData: FormData,
): Promise<VerificationAccessActionState> {
  const recordId = stringFormValue(formData, "recordId");
  if (!recordIdSchema.safeParse(recordId).success) {
    return { error: "invalid", status: "error" };
  }

  let context: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    context = await requireAdmin();
  } catch (error) {
    return {
      error: isKnownAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const authorization = await context.supabase
      .schema("api")
      .rpc("authorize_verification_evidence_access", {
        p_operation_id: randomUUID(),
        p_purpose: "identity_review",
        p_record_id: recordId,
      });
    const grant = verificationEvidenceAccessGrantSchema.safeParse(
      authorization.data,
    );

    if (authorization.error) {
      return { error: mapProviderError(authorization.error), status: "error" };
    }
    if (!grant.success || grant.data.record_id !== recordId) {
      return { error: "indeterminate", status: "error" };
    }

    const signed = await createSupabaseAdminClient()
      .storage.from("verification-documents")
      .createSignedUrl(grant.data.object_path, grant.data.expires_in_seconds);

    if (
      signed.error ||
      !signed.data?.signedUrl ||
      !isSafeSignedUrl(signed.data.signedUrl)
    ) {
      return { error: "unavailable", status: "error" };
    }

    return {
      documentId: grant.data.document_id,
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

export async function decideVerification(
  _state: VerificationDecisionActionState,
  formData: FormData,
): Promise<VerificationDecisionActionState> {
  const recordId = stringFormValue(formData, "recordId");
  const reviewedDocumentId = stringFormValue(formData, "reviewedDocumentId");
  const decision = stringFormValue(formData, "decision");
  const approvedIdType = stringFormValue(formData, "approvedIdType");
  const documentExpirationDate = stringFormValue(
    formData,
    "documentExpirationDate",
  );
  const rejectionReasonCode = stringFormValue(
    formData,
    "rejectionReasonCode",
  );
  const action = decision === "rejected" ? "reject" : "verify";
  const fieldErrors: VerificationDecisionActionState["fieldErrors"] = {};

  if (!recordIdSchema.safeParse(recordId).success) {
    fieldErrors.recordId = "This verification reference is invalid.";
  }
  if (!z.uuid().safeParse(reviewedDocumentId).success) {
    fieldErrors.reviewedDocumentId =
      "Request access to the current evidence before deciding.";
  }
  if (decision === "verified") {
    if (!z.enum(ACCEPTED_ID_TYPES).safeParse(approvedIdType).success) {
      fieldErrors.approvedIdType = "Choose an accepted ID type.";
    }
    if (
      !isIsoCalendarDate(documentExpirationDate) ||
      documentExpirationDate <= manilaBusinessDate()
    ) {
      fieldErrors.documentExpirationDate =
        "Expiration must be after today in Asia/Manila.";
    }
  } else if (decision === "rejected") {
    if (
      !z.enum(VERIFICATION_REJECTION_REASONS).safeParse(rejectionReasonCode)
        .success
    ) {
      fieldErrors.rejectionReasonCode = "Choose a safe rejection reason.";
    }
  } else {
    fieldErrors.recordId = "Choose a supported decision.";
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
      error: isKnownAuthorizationDenial(error) ? "unauthorized" : "indeterminate",
      status: "error",
    };
  }

  try {
    const result = await context.supabase.schema("api").rpc(
      "decide_verification",
      {
        p_approved_id_type: decision === "verified" ? approvedIdType : "",
        p_decision: decision,
        p_document_expiration_date:
          decision === "verified" ? documentExpirationDate : "",
        p_operation_id: randomUUID(),
        p_record_id: recordId,
        p_reviewed_document_id: reviewedDocumentId,
        p_rejection_reason_code:
          decision === "rejected" ? rejectionReasonCode : "",
      },
    );

    if (result.error) {
      revalidateVerificationViews(recordId);
      return { action, error: mapProviderError(result.error), status: "error" };
    }

    const committed = verificationDecisionResponseSchema.safeParse(result.data);
    revalidateVerificationViews(recordId);
    if (
      !committed.success ||
      committed.data.record_id !== recordId ||
      committed.data.status !== decision
    ) {
      return { action, error: "indeterminate", status: "error" };
    }

    return { action, status: "success" };
  } catch {
    revalidateVerificationViews(recordId);
    return { action, error: "indeterminate", status: "error" };
  }
}
