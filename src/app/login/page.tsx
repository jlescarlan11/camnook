import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/features/auth/components/login-form";
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
          Sign in securely
        </h1>
        <p className="mt-3 leading-7 text-stone-600">
          Enter the email for your invited account. We&apos;ll send a one-time
          code—no password or email link required.
        </p>
        {signedOut ? (
          <p
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            You&apos;ve been signed out on this device.
          </p>
        ) : null}
        <LoginForm returnTo={returnTo} />
        <p className="mt-6 text-sm leading-6 text-stone-500">
          CamNook is private during launch preparation. Requesting a code does
          not create a new account.
        </p>
      </section>
    </main>
  );
}
