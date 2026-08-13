import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access denied | CamNook",
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-12 text-stone-950">
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-700">
          Access denied
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">
          This area is for the CamNook administrator.
        </h1>
        <p className="mt-4 leading-7 text-stone-600">
          Your session is valid, but this account does not have administrator
          access.
        </p>
        <Link
          className="mt-8 inline-block rounded-xl bg-stone-950 px-5 py-3 font-medium text-white"
          href="/account"
        >
          Return to your account
        </Link>
      </section>
    </main>
  );
}
