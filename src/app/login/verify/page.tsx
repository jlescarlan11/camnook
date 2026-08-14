import type { Metadata } from "next";
import Link from "next/link";

import { OtpForm } from "@/features/auth/components/otp-form";
import { getTurnstileSiteKey } from "@/lib/auth/captcha-config";
import { getPendingLogin, maskEmail } from "@/lib/auth/pending-login";
import { loginPath } from "@/lib/auth/routes";

export const metadata: Metadata = {
  title: "Enter your code | CamNook",
};

export default async function VerifyOtpPage() {
  const pendingLogin = await getPendingLogin();
  const captchaSiteKey = getTurnstileSiteKey();

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-12 text-stone-950">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <Link
          className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700"
          href="/"
        >
          CamNook
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          Check your email
        </h1>
        {pendingLogin ? (
          <>
            <p className="mt-3 leading-7 text-stone-600">
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-stone-900">
                {maskEmail(pendingLogin.email)}
              </span>
              . The code can only be used once.
            </p>
            <OtpForm
              captchaSiteKey={captchaSiteKey}
              startAgainHref={loginPath(pendingLogin.returnTo)}
            />
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p>This sign-in attempt is missing or expired.</p>
            <Link
              className="mt-3 inline-block font-medium underline underline-offset-4"
              href="/login"
            >
              Request a new code
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
