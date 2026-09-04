"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";

export type KycActionState = {
  error?: "invalid" | "save" | "suspended" | "underage" | "unauthorized";
  fieldErrors?: Partial<Record<"addressLine1" | "birthDate" | "legalName" | "phone" | "psgcAreaCode", string>>;
  status: "error" | "idle";
};

const inputSchema = z.object({
  addressLine1: z.string().trim().min(3).max(200),
  areaCode: z.string().regex(/^\d{10}$/),
  birthDate: z.iso.date(),
  legalName: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  returnTo: z.string().max(1000),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function dateYearsAgo(years: number) {
  const value = new Date();
  value.setUTCFullYear(value.getUTCFullYear() - years);
  return value.toISOString().slice(0, 10);
}

function safeReturnTo(value: string) {
  return value.startsWith("/account") && !value.startsWith("//") ? value : "/account";
}

export async function saveKycProfile(
  _previous: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const raw = {
    addressLine1: value(formData, "addressLine1"),
    areaCode: value(formData, "psgcAreaCode"),
    birthDate: value(formData, "birthDate"),
    legalName: value(formData, "legalName"),
    phone: value(formData, "phone"),
    release: value(formData, "psgcRelease"),
    returnTo: value(formData, "returnTo"),
  };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      error: "invalid",
      fieldErrors: {
        addressLine1: errors.addressLine1 ? "Enter your house, building, and street." : undefined,
        birthDate: errors.birthDate ? "Enter a valid birthdate." : undefined,
        legalName: errors.legalName ? "Enter your full legal name." : undefined,
        phone: errors.phone ? "Enter a valid mobile number." : undefined,
        psgcAreaCode: errors.areaCode ? "Choose your barangay." : undefined,
      },
      status: "error",
    };
  }
  if (parsed.data.birthDate > dateYearsAgo(18)) {
    return {
      error: "underage",
      fieldErrors: { birthDate: "You must be at least 18 years old to rent." },
      status: "error",
    };
  }
  if (parsed.data.birthDate < dateYearsAgo(120)) {
    return {
      error: "invalid",
      fieldErrors: { birthDate: "Check your birthdate." },
      status: "error",
    };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    return { error: "unauthorized", status: "error" };
  }
  const result = await context.supabase.schema("api").rpc("save_my_kyc_profile", {
    p_input: {
      address_line1: parsed.data.addressLine1,
      area_code: parsed.data.areaCode,
      birth_date: parsed.data.birthDate,
      legal_name: parsed.data.legalName,
      phone: parsed.data.phone,
      release_key: parsed.data.release,
    },
  });
  if (result.error) {
    return {
      error: result.error.code === "42501" ? "suspended" : result.error.code === "22023" ? "invalid" : "save",
      status: "error",
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/bookings/new");
  redirect(safeReturnTo(parsed.data.returnTo));
}
