"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { stringFormValue } from "@/features/bookings/actions/state";
import {
  isAdminAuthorizationError,
  isAuthenticationError,
  AdminAuthorizationRequiredError,
} from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";

import {
  CONTRACT_TERM_KEYS,
  contractTermsSchema,
  publishContractTemplateResponseSchema,
} from "./template-types";

export type PublishContractTemplateState = {
  created?: boolean;
  error?:
    | "indeterminate"
    | "invalid_input"
    | "stale"
    | "unauthorized"
    | "version_conflict";
  fieldErrors?: Partial<Record<"approval" | "terms" | "version", string>>;
  status: "error" | "idle" | "success";
  version?: string;
};

const versionSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
const expectedActiveIdSchema = z.union([z.literal(""), z.uuid()]);

export async function publishContractTemplate(
  _state: PublishContractTemplateState,
  formData: FormData,
): Promise<PublishContractTemplateState> {
  const version = versionSchema.safeParse(stringFormValue(formData, "version"));
  const expectedActiveId = expectedActiveIdSchema.safeParse(
    stringFormValue(formData, "expectedActiveId"),
  );
  const terms = contractTermsSchema.safeParse(
    Object.fromEntries(
      CONTRACT_TERM_KEYS.map((key) => [key, stringFormValue(formData, key)]),
    ),
  );
  const approved = formData.get("approval") === "on";
  const fieldErrors: PublishContractTemplateState["fieldErrors"] = {};

  if (!version.success) {
    fieldErrors.version =
      "Use 1–80 letters, numbers, periods, underscores, or hyphens.";
  }
  if (!terms.success) {
    fieldErrors.terms =
      "Complete every required term using 10–4,000 characters each.";
  }
  if (!expectedActiveId.success) {
    fieldErrors.terms = "Reload before replacing the active template.";
  }
  if (!approved) {
    fieldErrors.approval =
      "Confirm that you reviewed and approve this exact template.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "invalid_input", fieldErrors, status: "error" };
  }

  // Postgres accepts NULL for this UUID argument, but generated RPC types model
  // every non-defaulted function argument as non-nullable.
  const expectedActiveTemplateId = (expectedActiveId.data || null) as string;

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch (error) {
    return {
      error:
        isAuthenticationError(error) ||
        error instanceof AdminAuthorizationRequiredError
          ? "unauthorized"
          : "indeterminate",
      status: "error",
    };
  }

  try {
    const result = await context.supabase
      .schema("api")
      .rpc("publish_contract_template", {
        p_expected_active_id: expectedActiveTemplateId,
        p_operation_id: randomUUID(),
        p_terms: terms.data!,
        p_version: version.data!,
      });
    if (isAdminAuthorizationError(result.error)) {
      return { error: "unauthorized", status: "error" };
    }
    if (result.error?.code === "40001") {
      return { error: "stale", status: "error" };
    }
    if (result.error?.code === "23505") {
      return { error: "version_conflict", status: "error" };
    }
    if (result.error?.code === "22023") {
      return { error: "invalid_input", status: "error" };
    }
    const committed = publishContractTemplateResponseSchema.safeParse(
      result.data,
    );
    if (result.error || !committed.success) {
      return { error: "indeterminate", status: "error" };
    }

    revalidatePath("/");
    revalidatePath("/admin/settings");
    return {
      created: committed.data.created,
      status: "success",
      version: committed.data.version,
    };
  } catch {
    return { error: "indeterminate", status: "error" };
  }
}
