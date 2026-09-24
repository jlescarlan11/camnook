import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/features/auth/components/login-form";
import { getTurnstileSiteKey } from "@/lib/auth/captcha-config";
import { sanitizeReturnTo } from "@/lib/auth/routes";

export const metadata: Metadata = {
  title: "Sign in | CamNook",
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    signed_out?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const returnTo = sanitizeReturnTo(next);
  const signedOut = params.signed_out === "1";
  const captchaSiteKey = getTurnstileSiteKey();

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12 text-stone-950">
      <div className="w-full max-w-md">
        <section className="surface w-full p-8 sm:p-10">
          <Link
            className="text-sm font-semibold uppercase tracking-[0.24em] text-[#0b4f9c]"
            href="/"
          >
            CamNook
          </Link>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-3 leading-7 text-stone-600">
            We&apos;ll email you a one-time code.
          </p>
          {signedOut ? (
            <p
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              role="status"
            >
              You&apos;ve been signed out on this device.
            </p>
          ) : null}
          <LoginForm captchaSiteKey={captchaSiteKey} returnTo={returnTo} />
        </section>
        <Link
          className="mx-auto mt-6 flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-950 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b4f9c]"
          href="/"
        >
          <span aria-hidden="true">←</span>
          Return to home
        </Link>
      </div>
    </main>
  );
}
