"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import {
  resendEmailOtp,
  verifyEmailOtp,
} from "@/features/auth/actions";
import { initialAuthFormState } from "@/lib/auth/state";

import {
  CaptchaChallenge,
  type CaptchaChallengeHandle,
} from "./captcha-challenge";

export function OtpForm({
  captchaSiteKey,
  startAgainHref,
}: {
  captchaSiteKey: string | null;
  startAgainHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    verifyEmailOtp,
    initialAuthFormState,
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendEmailOtp,
    initialAuthFormState,
  );
  const captchaRef = useRef<CaptchaChallengeHandle>(null);
  const [captchaReady, setCaptchaReady] = useState(!captchaSiteKey);

  function resend(formData: FormData) {
    resendAction(formData);
    if (captchaSiteKey) {
      captchaRef.current?.reset();
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <form action={formAction} className="space-y-5">
        <div>
          <label
            className="block text-sm font-medium text-stone-800"
            htmlFor="token"
          >
            Verification code
          </label>
          <input
            aria-describedby={state.fieldErrors?.token ? "token-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.token)}
            autoComplete="one-time-code"
            autoFocus
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.32em] outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            id="token"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="token"
            pattern="[0-9]{6}"
            placeholder="000000"
            required
            type="text"
          />
          {state.fieldErrors?.token ? (
            <p className="mt-2 text-sm text-red-700" id="token-error" role="alert">
              {state.fieldErrors.token}
            </p>
          ) : null}
          {state.message ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {state.message}
            </p>
          ) : null}
        </div>
        <button
          className="w-full rounded-xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || resendPending}
          type="submit"
        >
          {pending ? "Checking code…" : "Verify and sign in"}
        </button>
      </form>

      <div className="border-t border-stone-200 pt-5 text-sm text-stone-600">
        <form action={resend}>
          {captchaSiteKey ? (
            <div className="mb-4">
              <CaptchaChallenge
                action="resend_email_otp"
                onTokenChange={setCaptchaReady}
                ref={captchaRef}
                siteKey={captchaSiteKey}
              />
            </div>
          ) : null}
          <button
            className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending || resendPending || !captchaReady}
            type="submit"
          >
            {resendPending ? "Sending…" : "Send another code"}
          </button>
        </form>
        {resendState.message ? (
          <p
            className={`mt-3 ${resendState.status === "error" ? "text-red-700" : "text-stone-600"}`}
            role="status"
          >
            {resendState.message}
          </p>
        ) : null}
        <p className="mt-3">
          Wrong email?{" "}
          <Link
            className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-4"
            href={startAgainHref}
          >
            Start again
          </Link>
        </p>
      </div>
    </div>
  );
}
