"use client";

import { useActionState, useRef, useState } from "react";

import { requestEmailOtp } from "@/features/auth/actions";
import { initialAuthFormState } from "@/lib/auth/state";

import {
  CaptchaChallenge,
  type CaptchaChallengeHandle,
} from "./captcha-challenge";

export function LoginForm({
  captchaSiteKey,
  returnTo,
}: {
  captchaSiteKey: string | null;
  returnTo: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestEmailOtp,
    initialAuthFormState,
  );
  const captchaRef = useRef<CaptchaChallengeHandle>(null);
  const [captchaReady, setCaptchaReady] = useState(!captchaSiteKey);

  function submit(formData: FormData) {
    formAction(formData);
    if (captchaSiteKey) {
      captchaRef.current?.reset();
    }
  }

  return (
    <form action={submit} className="mt-8 space-y-5">
      <input name="next" type="hidden" value={returnTo} />
      <div>
        <label
          className="block text-sm font-medium text-stone-800"
          htmlFor="email"
        >
          Email address
        </label>
        <input
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          autoComplete="email"
          autoFocus
          className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
          id="email"
          inputMode="email"
          maxLength={254}
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        {state.fieldErrors?.email ? (
          <p className="mt-2 text-sm text-red-700" id="email-error" role="alert">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>
      {captchaSiteKey ? (
        <CaptchaChallenge
          action="request_email_otp"
          onTokenChange={setCaptchaReady}
          ref={captchaRef}
          siteKey={captchaSiteKey}
        />
      ) : null}
      {state.message ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || !captchaReady}
        type="submit"
      >
        {pending ? "Sending code…" : "Email me a sign-in or registration code"}
      </button>
    </form>
  );
}
