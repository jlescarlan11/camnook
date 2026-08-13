"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

import { stringFormValue, type ActionStatus } from "./state";

export type ProfileActionState = {
  error?: "invalid_input" | "save_failed" | "suspended";
  fieldErrors?: { legalName?: string; phone?: string };
  status: ActionStatus;
  values?: { legalName: string; phone: string };
};

const profileSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32),
});

export async function saveProfile(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const values = {
    legalName: stringFormValue(formData, "legalName"),
    phone: stringFormValue(formData, "phone"),
  };
  const parsed = profileSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    return {
      error: "invalid_input",
      fieldErrors: {
        legalName: flattened.legalName
          ? "Enter your legal name (2–160 characters)."
          : undefined,
        phone: flattened.phone
          ? "Enter a phone number (7–32 characters)."
          : undefined,
      },
      status: "error",
      values,
    };
  }

  const { supabase, user } = await requireUser();
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) {
    return { error: "save_failed", status: "error", values };
  }
  if (existing?.account_status === "suspended") {
    return { error: "suspended", status: "error", values };
  }

  const { data, error } = await supabase.schema("api").rpc("ensure_profile", {
    p_legal_name: parsed.data.legalName,
    p_phone: parsed.data.phone,
  });

  if (error || data?.account_status !== "active") {
    return {
      error: data?.account_status === "suspended" ? "suspended" : "save_failed",
      status: "error",
      values,
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/bookings/new");
  return { status: "success" };
}
