import type { AuthFormState } from "../../src/lib/auth/state";

export async function requestEmailOtp(): Promise<AuthFormState> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { status: "error", message: "Synthetic email service failure. Please retry." };
}

export async function verifyEmailOtp(): Promise<AuthFormState> {
  return { status: "error", message: "We couldn’t verify that code right now. Try again in a moment." };
}

export async function resendEmailOtp(): Promise<AuthFormState> {
  return { status: "error", message: "Synthetic resend failure. No email was sent." };
}
