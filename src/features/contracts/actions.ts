"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthenticatedUser } from "@/lib/auth/require-user";

import { stringFormValue } from "../bookings/actions/state";

export type SignContractActionState = {
  created?: boolean;
  error?: "expired" | "invalid_input" | "stale" | "unauthorized" | "unknown";
  fieldErrors?: {
    bookingId?: string;
    consent?: string;
    contractVersionId?: string;
  };
  status: "error" | "idle" | "indeterminate" | "stale" | "success";
};

const signInputSchema = z.object({
  bookingId: z.uuid(),
  consent: z.literal(true),
  contractVersionId: z.uuid(),
});

export async function signContract(
  _state: SignContractActionState,
  formData: FormData,
): Promise<SignContractActionState> {
  const parsed = signInputSchema.safeParse({
    bookingId: stringFormValue(formData, "bookingId"),
    consent: formData.get("consent") === "on",
    contractVersionId: stringFormValue(formData, "contractVersionId"),
  });

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    return {
      error: "invalid_input",
      fieldErrors: {
        bookingId: flattened.bookingId
          ? "Refresh this booking before signing."
          : undefined,
        consent: flattened.consent
          ? "Confirm that you reviewed and agree to this exact contract."
          : undefined,
        contractVersionId: flattened.contractVersionId
          ? "Refresh before signing this contract."
          : undefined,
      },
      status: "error",
    };
  }

  const context = await getAuthenticatedUser();
  if (!context) {
    return { error: "unauthorized", status: "error" };
  }

  let result: {
    data: unknown;
    error: { code?: string; message?: string } | null;
  };
  try {
    result = await context.supabase.schema("api").rpc("sign_contract", {
      p_consent: true,
      p_contract_version_id: parsed.data.contractVersionId,
    });
  } catch {
    revalidateContractViews(parsed.data.bookingId);
    return { error: "unknown", status: "indeterminate" };
  }

  if (result.error) {
    revalidateContractViews(parsed.data.bookingId);
    const message = result.error.message ?? "";
    if (result.error.code === "42501" || result.error.code === "P0002") {
      return { error: "unauthorized", status: "error" };
    }
    if (message === "contract_deadline_elapsed") {
      return { error: "expired", status: "stale" };
    }
    if (result.error.code === "40001") {
      return { error: "stale", status: "stale" };
    }
    return { error: "unknown", status: "indeterminate" };
  }

  revalidateContractViews(parsed.data.bookingId);
  const output = z
    .array(
      z.object({
        created: z.boolean(),
        signature_id: z.uuid(),
        signed_at: z.string().min(1),
      }),
    )
    .length(1)
    .safeParse(result.data);
  if (!output.success) {
    return { error: "unknown", status: "indeterminate" };
  }

  return {
    created: output.data[0].created,
    status: "success",
  };
}

function revalidateContractViews(bookingId: string) {
  revalidatePath("/account");
  revalidatePath(`/account/bookings/${bookingId}`);
  revalidatePath("/admin");
  revalidatePath(`/admin/bookings/${bookingId}`);
}
