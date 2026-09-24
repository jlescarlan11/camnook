import type { AuthFormState } from "../../src/lib/auth/state";

export async function requestEmailOtp(): Promise<AuthFormState> {
  if (new URLSearchParams(window.location.search).get("failure") === "transport") throw new Error("Synthetic interrupted action response");
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { status: "error", message: "Synthetic email service failure. Please retry." };
}

export async function verifyEmailOtp(): Promise<AuthFormState> {
  if (new URLSearchParams(window.location.search).get("failure") === "transport") throw new Error("Synthetic interrupted verification response");
  return { status: "error", message: "We couldn’t verify that code right now. Try again in a moment." };
}

export async function resendEmailOtp(): Promise<AuthFormState> {
  if (new URLSearchParams(window.location.search).get("failure") === "transport") throw new Error("Synthetic interrupted resend response");
  return { status: "error", message: "Synthetic resend failure. No email was sent." };
}
