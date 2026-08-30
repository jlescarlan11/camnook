"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAuthenticationError } from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";

import { stringFormValue } from "../bookings/actions/state";
import { parseManilaBookingPeriod } from "../bookings/manila-time";

export type SupersedeContractActionState = {
  error?:
    | "availability"
    | "invalid_input"
    | "no_change"
    | "stale"
    | "unauthorized"
    | "unknown";
  fieldErrors?: { bookingId?: string; camera?: string; pickup?: string; return?: string };
  status: "error" | "idle" | "indeterminate" | "stale" | "success";
};

const identitySchema = z.object({ bookingId: z.uuid(), camera: z.uuid() });

export async function supersedeContract(
  _state: SupersedeContractActionState,
  formData: FormData,
): Promise<SupersedeContractActionState> {
  const values = {
    bookingId: stringFormValue(formData, "bookingId"),
    camera: stringFormValue(formData, "camera"),
    pickup: stringFormValue(formData, "pickup"),
    return: stringFormValue(formData, "return"),
  };
  const identity = identitySchema.safeParse(values);
  const period = parseManilaBookingPeriod(values.pickup, values.return);

  if (!identity.success || !period.ok) {
    const flattened = identity.success
      ? {}
      : z.flattenError(identity.error).fieldErrors;
    return {
      error: "invalid_input",
      fieldErrors: {
        bookingId: flattened.bookingId
          ? "Refresh this booking before issuing a replacement."
          : undefined,
        camera: flattened.camera ? "Choose an available camera." : undefined,
        ...(!period.ok ? period.fieldErrors : {}),
      },
      status: "error",
    };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch (error) {
    if (isAuthenticationError(error)) {
      return { error: "unauthorized", status: "error" };
    }
    return { error: "unknown", status: "indeterminate" };
  }

  let result: {
    data: unknown;
    error: { code?: string; message?: string } | null;
  };
  try {
    result = await context.supabase.schema("api").rpc("supersede_contract", {
      p_booking_id: identity.data.bookingId,
      p_camera_id: identity.data.camera,
      p_pickup_at: period.pickupAt,
      p_return_at: period.returnAt,
    });
  } catch {
    revalidateContractViews(identity.data.bookingId);
    return { error: "unknown", status: "indeterminate" };
  }

  if (result.error) {
    revalidateContractViews(identity.data.bookingId);
    const message = result.error.message ?? "";
    if (result.error.code === "42501") {
      return { error: "unauthorized", status: "error" };
    }
    if (message === "contract_no_material_change") {
      return { error: "no_change", status: "error" };
    }
    if (
      result.error.code === "23P01" ||
      message === "contract_availability_conflict"
    ) {
      return { error: "availability", status: "stale" };
    }
    if (
      result.error.code === "P0002" ||
      result.error.code === "40001" ||
      message === "contract_deadline_elapsed"
    ) {
      return { error: "stale", status: "stale" };
    }
    return { error: "unknown", status: "indeterminate" };
  }

  revalidateContractViews(identity.data.bookingId);
  if (!z.uuid().safeParse(result.data).success) {
    return { error: "unknown", status: "indeterminate" };
  }
  return { status: "success" };
}

function revalidateContractViews(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/account");
  revalidatePath(`/account/bookings/${bookingId}`);
}
