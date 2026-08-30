"use server";

import { revalidatePath } from "next/cache";

import {
  isAuthenticationError,
} from "@/lib/auth/require-admin";
import { requireUser } from "@/lib/auth/require-user";

import { stringFormValue } from "../actions/state";
import {
  mapApprovalError,
  mapRejectionError,
  type ApprovalErrorCategory,
  type RejectionErrorCategory,
  validateDecisionInput,
} from "./errors";

export type DecisionActionState = {
  action?: "approve" | "reject";
  category?: ApprovalErrorCategory | RejectionErrorCategory;
  committed?: true;
  fieldErrors?: { bookingId?: string; reason?: string };
  status: "error" | "idle" | "indeterminate" | "stale" | "success";
};

function revalidateDecisionViews(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/bookings/${bookingId}`);
}

function categoryStatus(category: ApprovalErrorCategory | RejectionErrorCategory) {
  if (category === "indeterminate") return "indeterminate" as const;
  if (
    category === "availability_conflict" ||
    category === "not_found" ||
    category === "stale"
  ) {
    return "stale" as const;
  }
  return "error" as const;
}

function isKnownAuthorizationDenial(error: unknown) {
  return isAuthenticationError(error);
}

export async function approveBooking(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  const validated = validateDecisionInput({
    bookingId: stringFormValue(formData, "bookingId"),
  });
  if (!validated.ok) {
    return {
      action: "approve",
      fieldErrors: validated.fieldErrors,
      status: "error",
    };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch (error) {
    if (isKnownAuthorizationDenial(error)) {
      return {
        action: "approve",
        category: "unauthorized",
        status: "error",
      };
    }
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "approve",
      category: "indeterminate",
      status: "indeterminate",
    };
  }

  let result: {
    error: { code?: string; message?: string } | null;
  };
  try {
    result = await context.supabase.schema("api").rpc("approve_booking", {
      p_booking_id: validated.bookingId,
    });
  } catch {
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "approve",
      category: "indeterminate",
      status: "indeterminate",
    };
  }

  if (result.error) {
    const category = mapApprovalError(result.error);
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "approve",
      category,
      status: categoryStatus(category),
    };
  }

  revalidateDecisionViews(validated.bookingId);
  return { action: "approve", committed: true, status: "success" };
}

export async function rejectBooking(
  _state: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  const validated = validateDecisionInput({
    bookingId: stringFormValue(formData, "bookingId"),
    reason: stringFormValue(formData, "reason"),
  });
  if (!validated.ok || !("reason" in validated)) {
    return {
      action: "reject",
      fieldErrors: validated.fieldErrors,
      status: "error",
    };
  }

  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch (error) {
    if (isKnownAuthorizationDenial(error)) {
      return {
        action: "reject",
        category: "unauthorized",
        status: "error",
      };
    }
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "reject",
      category: "indeterminate",
      status: "indeterminate",
    };
  }

  let result: {
    error: { code?: string; message?: string } | null;
  };
  try {
    result = await context.supabase.schema("api").rpc("reject_booking", {
      p_booking_id: validated.bookingId,
      p_reason: validated.reason!,
    });
  } catch {
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "reject",
      category: "indeterminate",
      status: "indeterminate",
    };
  }

  if (result.error) {
    const category = mapRejectionError(result.error);
    revalidateDecisionViews(validated.bookingId);
    return {
      action: "reject",
      category,
      status: categoryStatus(category),
    };
  }

  revalidateDecisionViews(validated.bookingId);
  return { action: "reject", committed: true, status: "success" };
}
