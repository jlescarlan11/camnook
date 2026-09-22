"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { sanitizeReturnTo } from "@/lib/auth/routes";
import { philippineMobileSchema } from "@/lib/phone/philippine-mobile";

import { formatResidentialLine1 } from "./types";
import { kycDateYearsAgo } from "./age";

export type KycFormValues = {
  addressDetails: string;
  birthDate: string;
  building: string;
  houseNumber: string;
  legalName: string;
  legacyAddressLine1: string;
  phone: string;
  postalCode: string;
  streetName: string;
};

export type KycActionState = {
  error?: "invalid" | "pin_reconfirmation" | "save" | "suspended" | "underage" | "unauthorized";
  fieldErrors?: Partial<Record<keyof KycFormValues | "psgcAreaCode" | "residentialPin", string>>;
  status: "error" | "idle";
  values?: KycFormValues;
};

const text = (maximum: number) => z.string().trim().max(maximum)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

const inputSchema = z.object({
  addressDetails: text(200),
  areaCode: z.string().regex(/^\d{10}$/),
  birthDate: z.iso.date(),
  building: text(160),
  expectedAddressRevision: z.union([z.literal(""), z.uuid()]),
  houseNumber: text(80),
  legalName: z.string().trim().min(2).max(160),
  legacyAddressLine1: text(500),
  pinAccuracyMeters: z.string().trim().max(20),
  pinLatitude: z.string().trim().max(30),
  pinLongitude: z.string().trim().max(30),
  pinOperation: z.enum(["keep", "remove", "set"]),
  pinSource: z.enum(["", "device_gps", "map_pin"]),
  phone: philippineMobileSchema,
  postalCode: z.string().trim().regex(/^\d{4}$/, "Enter a four-digit Philippine postal code."),
  release: z.string().regex(/^\d{4}-q[1-4]$/),
  returnTo: z.string().max(1000),
  savedPinPresent: z.enum(["0", "1"]),
  streetName: text(160),
}).superRefine((data, context) => {
  const structuredLine = formatResidentialLine1(data);
  if (!structuredLine) {
    context.addIssue({
      code: "custom",
      message: "Enter your current residential address using the structured fields.",
      path: ["addressDetails"],
    });
  }
  if (data.streetName) {
    const hasNumberedPremises = Boolean(data.houseNumber);
    const hasBuildingAndUnit = Boolean(data.building && data.addressDetails);
    if (!hasNumberedPremises && !hasBuildingAndUnit) {
      context.addIssue({
        code: "custom",
        message: "Enter a house or lot number, or enter both a building name and unit details.",
        path: ["houseNumber"],
      });
    }
  } else {
    if (!data.addressDetails) {
      context.addIssue({
        code: "custom",
        message: "For an unnamed road, enter a subdivision, sitio, and nearby landmark.",
        path: ["addressDetails"],
      });
    }
  }
  if (
    data.pinOperation === "remove" ||
    (data.pinOperation === "keep" && data.savedPinPresent === "0")
  ) {
    context.addIssue({
      code: "custom",
      message: "Add and confirm your private residential map pin.",
      path: ["pinLatitude"],
    });
  }
  if (structuredLine.length > 500) {
    context.addIssue({
      code: "custom",
      message: "Shorten the combined address details.",
      path: ["addressDetails"],
    });
  }
  if (data.pinOperation === "set") {
    const latitude = Number(data.pinLatitude);
    const longitude = Number(data.pinLongitude);
    const accuracy = data.pinAccuracyMeters ? Number(data.pinAccuracyMeters) : null;
    if (
      !Number.isFinite(latitude) || latitude < 4 || latitude > 22 ||
      !Number.isFinite(longitude) || longitude < 116 || longitude > 127 ||
      data.pinSource === "" ||
      (data.pinSource === "map_pin" && accuracy !== null) ||
      (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 1 || accuracy > 50_000))
    ) {
      context.addIssue({
        code: "custom",
        message: "Confirm a valid location in the Philippines.",
        path: ["pinLatitude"],
      });
    }
  } else if (
    data.pinSource !== "" || data.pinLatitude !== "" ||
    data.pinLongitude !== "" || data.pinAccuracyMeters !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "Remove unexpected map pin values and try again.",
      path: ["pinLatitude"],
    });
  }
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function safeReturnTo(value: string) {
  // Account editing intentionally returns to this section; login strips anchors.
  if (value === "/account#default-address") return value;
  return sanitizeReturnTo(value);
}

export async function saveKycProfile(
  _previous: KycActionState,
  formData: FormData,
): Promise<KycActionState> {
  const raw = {
    addressDetails: value(formData, "addressDetails"),
    areaCode: value(formData, "psgcAreaCode"),
    birthDate: value(formData, "birthDate"),
    building: value(formData, "building"),
    expectedAddressRevision: value(formData, "expectedAddressRevision"),
    houseNumber: value(formData, "houseNumber"),
    legalName: value(formData, "legalName"),
    legacyAddressLine1: value(formData, "legacyAddressLine1"),
    pinAccuracyMeters: value(formData, "pinAccuracyMeters"),
    pinLatitude: value(formData, "pinLatitude"),
    pinLongitude: value(formData, "pinLongitude"),
    pinOperation: value(formData, "pinOperation"),
    pinSource: value(formData, "pinSource"),
    phone: value(formData, "phone"),
    postalCode: value(formData, "postalCode"),
    release: value(formData, "psgcRelease"),
    returnTo: value(formData, "returnTo"),
    savedPinPresent: value(formData, "savedPinPresent"),
    streetName: value(formData, "streetName"),
  };
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return {
      error: "invalid",
      fieldErrors: {
        addressDetails: errors.addressDetails?.[0],
        birthDate: errors.birthDate ? "Enter a valid birthdate." : undefined,
        building: errors.building?.[0],
        houseNumber: errors.houseNumber?.[0],
        legalName: errors.legalName ? "Enter your full legal name." : undefined,
        legacyAddressLine1: errors.legacyAddressLine1?.[0],
        phone: errors.phone ? "Enter a 10-digit Philippine mobile number after +63." : undefined,
        postalCode: errors.postalCode?.[0],
        psgcAreaCode: errors.areaCode ? "Choose your barangay." : undefined,
        residentialPin: errors.pinLatitude?.[0],
        streetName: errors.streetName?.[0],
      },
      status: "error",
      values: pickFormValues(raw),
    };
  }
  if (parsed.data.birthDate > kycDateYearsAgo(18)) {
    return {
      error: "underage",
      fieldErrors: { birthDate: "You must be at least 18 years old to rent." },
      status: "error",
      values: pickFormValues(raw),
    };
  }
  if (parsed.data.birthDate < kycDateYearsAgo(120)) {
    return {
      error: "invalid",
      fieldErrors: { birthDate: "Check your birthdate." },
      status: "error",
      values: pickFormValues(raw),
    };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    return { error: "unauthorized", status: "error", values: pickFormValues(raw) };
  }
  const hasStructuredAddress = Boolean(formatResidentialLine1(parsed.data));
  const addressDetails = hasStructuredAddress
    ? parsed.data.addressDetails
    : parsed.data.postalCode && parsed.data.legacyAddressLine1
      ? parsed.data.legacyAddressLine1
      : parsed.data.addressDetails;
  const result = await context.supabase.schema("api").rpc("save_my_kyc_profile_v2", {
    p_input: {
      address_details: addressDetails || null,
      area_code: parsed.data.areaCode,
      birth_date: parsed.data.birthDate,
      building: parsed.data.building || null,
      expected_address_revision: parsed.data.expectedAddressRevision || null,
      house_number: parsed.data.houseNumber || null,
      legacy_address_line1: hasStructuredAddress || parsed.data.postalCode
        ? null
        : parsed.data.legacyAddressLine1,
      legal_name: parsed.data.legalName,
      pin_accuracy_meters: parsed.data.pinAccuracyMeters || null,
      pin_consent_version: parsed.data.pinOperation === "set"
        ? "residential-pin-v1"
        : null,
      pin_latitude: parsed.data.pinLatitude || null,
      pin_longitude: parsed.data.pinLongitude || null,
      pin_operation: parsed.data.pinOperation,
      pin_source: parsed.data.pinSource || null,
      phone: parsed.data.phone,
      postal_code: parsed.data.postalCode || null,
      release_key: parsed.data.release,
      street_name: parsed.data.streetName || null,
    },
  });
  if (result.error) {
    return {
      error: result.error.code === "42501"
        ? "suspended"
        : result.error.code === "40001"
          ? "pin_reconfirmation"
          : result.error.code === "22023"
            ? "invalid"
            : "save",
      status: "error",
      values: pickFormValues(raw),
    };
  }

  revalidatePath("/account");
  revalidatePath("/checkout");
  redirect(safeReturnTo(parsed.data.returnTo));
}

function pickFormValues(raw: KycFormValues): KycFormValues {
  return {
    addressDetails: raw.addressDetails,
    birthDate: raw.birthDate,
    building: raw.building,
    houseNumber: raw.houseNumber,
    legalName: raw.legalName,
    legacyAddressLine1: raw.legacyAddressLine1,
    phone: raw.phone,
    postalCode: raw.postalCode,
    streetName: raw.streetName,
  };
}
