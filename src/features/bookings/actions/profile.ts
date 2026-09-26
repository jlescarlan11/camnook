"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

import { stringFormValue, type ActionStatus } from "./state";
import { philippineMobileSchema } from "@/lib/phone/philippine-mobile";

export type ProfileActionState = {
  error?: "invalid_input" | "save_failed" | "suspended";
  fieldErrors?: { legalName?: string; phone?: string };
  status: ActionStatus;
  values?: { legalName: string; phone: string };
};

const profileSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  phone: philippineMobileSchema,
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
          ? "Enter a 10-digit Philippine mobile number after +63."
          : undefined,
      },
      status: "error",
      values,
    };
  }

  const { supabase } = await requireUser();

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
  revalidatePath("/account/profile");
  revalidatePath("/checkout");
  return { status: "success" };
}
