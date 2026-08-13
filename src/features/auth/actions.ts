"use server";

import { redirect } from "next/navigation";

import {
  clearPendingLogin,
  getPendingLogin,
  setPendingLogin,
} from "@/lib/auth/pending-login";
import { sanitizeReturnTo } from "@/lib/auth/routes";
import type { AuthFormState } from "@/lib/auth/state";
import {
  emailOtpSchema,
  emailSchema,
  stringFormValue,
} from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_SENT_MESSAGE =
  "If that email belongs to an invited CamNook account, a sign-in code has been sent.";

function reportAuthProviderError(operation: string, error: unknown) {
  const details =
    error && typeof error === "object"
      ? {
          code: "code" in error ? String(error.code) : undefined,
          name: "name" in error ? String(error.name) : undefined,
          status: "status" in error ? String(error.status) : undefined,
        }
      : undefined;

  console.error(`[auth] ${operation} failed`, details);
}

async function sendOtp(email: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  if (error) {
    reportAuthProviderError("email OTP request", error);
  }
}

export async function requestEmailOtp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailSchema.safeParse(stringFormValue(formData, "email"));

  if (!email.success) {
    return {
      fieldErrors: { email: "Enter a valid email address." },
      status: "error",
    };
  }

  const returnTo = sanitizeReturnTo(stringFormValue(formData, "next"));

  await sendOtp(email.data);
  await setPendingLogin(email.data, returnTo);
  redirect("/login/verify");
}

export async function resendEmailOtp(
  _state: AuthFormState,
  _formData: FormData,
): Promise<AuthFormState> {
  void _state;
  void _formData;

  const pendingLogin = await getPendingLogin();

  if (!pendingLogin) {
    return {
      message: "Start again so CamNook knows where to send your code.",
      status: "error",
    };
  }

  await sendOtp(pendingLogin.email);

  return {
    message: OTP_SENT_MESSAGE,
    status: "success",
  };
}

export async function verifyEmailOtp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = emailOtpSchema.safeParse(stringFormValue(formData, "token"));

  if (!token.success) {
    return {
      fieldErrors: { token: "Enter the 6-digit code from your email." },
      status: "error",
    };
  }

  const pendingLogin = await getPendingLogin();

  if (!pendingLogin) {
    return {
      message: "This sign-in attempt expired. Request a new code.",
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: pendingLogin.email,
    token: token.data,
    type: "email",
  });

  if (error || !data.session || !data.user) {
    if (error) {
      reportAuthProviderError("email OTP verification", error);
    }

    return {
      fieldErrors: {
        token: "That code is invalid or has expired. Check it and try again.",
      },
      status: "error",
    };
  }

  const returnTo = pendingLogin.returnTo;
  await clearPendingLogin();
  redirect(returnTo);
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    reportAuthProviderError("local sign-out", error);
  }

  await clearPendingLogin();
  redirect("/login?signed_out=1");
}
