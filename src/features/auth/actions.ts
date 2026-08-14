"use server";

import { redirect } from "next/navigation";

import { isTurnstileConfigured } from "@/lib/auth/captcha-config";
import {
  clearPendingLogin,
  getPendingLogin,
  setPendingLogin,
} from "@/lib/auth/pending-login";
import { sanitizeReturnTo } from "@/lib/auth/routes";
import type { AuthFormState } from "@/lib/auth/state";
import {
  captchaTokenSchema,
  emailOtpSchema,
  emailSchema,
  stringFormValue,
} from "@/lib/auth/validation";
import {
  clearSupabaseAuthCookies,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const OTP_SENT_MESSAGE =
  "If the request can be completed, a code is on its way. Check your email before requesting another one.";

const CAPTCHA_REQUIRED_MESSAGE =
  "Complete the security check, then request a code again.";
const OTP_RATE_LIMIT_MESSAGE =
  "Too many code requests were made. Wait before trying again.";
const OTP_UNAVAILABLE_MESSAGE =
  "We couldn’t send a code right now. Try again in a moment.";
const OTP_VERIFY_RATE_LIMIT_MESSAGE =
  "Too many verification attempts were made. Wait a moment, then try again.";
const OTP_VERIFY_UNAVAILABLE_MESSAGE =
  "We couldn’t verify that code right now. Try again in a moment.";

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

function authErrorMetadata(error: unknown) {
  return error && typeof error === "object"
    ? {
        code: "code" in error ? String(error.code) : undefined,
        status: "status" in error ? Number(error.status) : undefined,
      }
    : {};
}

function isProviderUnavailable(error: unknown) {
  const { status } = authErrorMetadata(error);
  return status === undefined || status === 0 || status >= 500;
}

function isEnumerationSensitiveNoSend(error: unknown) {
  const { code } = authErrorMetadata(error);
  return code === "signup_disabled" || code === "user_not_found";
}

function otpRequestErrorState(error: unknown): AuthFormState {
  const { code, status } = authErrorMetadata(error);

  if (code === "captcha_failed") {
    return { message: CAPTCHA_REQUIRED_MESSAGE, status: "error" };
  }

  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return { message: OTP_RATE_LIMIT_MESSAGE, status: "error" };
  }

  return { message: OTP_UNAVAILABLE_MESSAGE, status: "error" };
}

function captchaToken(formData: FormData) {
  const parsed = captchaTokenSchema.safeParse(
    stringFormValue(formData, "captchaToken"),
  );
  return parsed.success ? parsed.data : undefined;
}

async function sendOtp(email: string, token: string | undefined) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        ...(token ? { captchaToken: token } : {}),
        shouldCreateUser: true,
      },
    });

    if (error) {
      reportAuthProviderError("email OTP request", error);
      // During a controlled signup-disabled rollout window, Supabase may
      // accept an existing account but reject an unknown one. Continue with
      // the same pending-login UI in both cases so the response cannot be used
      // to enumerate registered email addresses. No session is created.
      if (isEnumerationSensitiveNoSend(error)) return null;
      return otpRequestErrorState(error);
    }

    return null;
  } catch (error) {
    reportAuthProviderError("email OTP request", error);
    return otpRequestErrorState(error);
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
  const token = captchaToken(formData);

  if (isTurnstileConfigured() && !token) {
    return { message: CAPTCHA_REQUIRED_MESSAGE, status: "error" };
  }

  const errorState = await sendOtp(email.data, token);
  if (errorState) {
    return errorState;
  }

  await setPendingLogin(email.data, returnTo);
  redirect("/login/verify");
}

export async function resendEmailOtp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  void _state;

  const pendingLogin = await getPendingLogin();

  if (!pendingLogin) {
    return {
      message: "Start again so CamNook knows where to send your code.",
      status: "error",
    };
  }

  const token = captchaToken(formData);
  if (isTurnstileConfigured() && !token) {
    return { message: CAPTCHA_REQUIRED_MESSAGE, status: "error" };
  }

  const errorState = await sendOtp(pendingLogin.email, token);
  if (errorState) {
    return errorState;
  }

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

  let verification;
  try {
    const supabase = await createSupabaseServerClient();
    verification = await supabase.auth.verifyOtp({
      email: pendingLogin.email,
      token: token.data,
      type: "email",
    });
  } catch (error) {
    reportAuthProviderError("email OTP verification", error);
    return { message: OTP_VERIFY_UNAVAILABLE_MESSAGE, status: "error" };
  }

  const { data, error } = verification;

  if (error || !data.session || !data.user) {
    if (error) {
      reportAuthProviderError("email OTP verification", error);
    }

    const { code, status } = authErrorMetadata(error);
    return status === 429 || code === "over_request_rate_limit"
      ? { message: OTP_VERIFY_RATE_LIMIT_MESSAGE, status: "error" }
      : isProviderUnavailable(error)
        ? { message: OTP_VERIFY_UNAVAILABLE_MESSAGE, status: "error" }
        : {
            fieldErrors: {
              token:
                "That code is invalid, expired, or already used. Request a new code if needed.",
            },
            status: "error",
          };
  }

  const returnTo = pendingLogin.returnTo;
  await clearPendingLogin();
  redirect(returnTo);
}

export async function logout() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      reportAuthProviderError("local sign-out", error);
    }
  } catch (error) {
    reportAuthProviderError("local sign-out", error);
  }

  let cookieCleanupFailed = false;
  try {
    // A network/provider exception can occur before auth-js removes its local
    // cookie. Expire every chunk in this project's supported SSR namespace so
    // a failed remote call cannot leave the browser authenticated.
    await clearSupabaseAuthCookies();
  } catch (error) {
    cookieCleanupFailed = true;
    reportAuthProviderError("local cookie cleanup", error);
  }

  await clearPendingLogin();

  if (cookieCleanupFailed) {
    throw new Error("Local session cleanup could not be completed");
  }

  redirect("/login?signed_out=1");
}
