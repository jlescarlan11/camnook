import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { getAdminStatus } from "@/lib/auth/require-admin";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account | CamNook",
};

export default async function AccountPage() {
  const context = await requirePageUser("/account");
  const isAdmin = await getAdminStatus(context);

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-950">
      <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
          CamNook account
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          You&apos;re signed in
        </h1>
        <p className="mt-4 text-stone-600">{context.user.email}</p>
        <p className="mt-6 max-w-2xl leading-7 text-stone-600">
          Rental booking remains closed while pricing, privacy, and contract
          launch decisions are under review.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {isAdmin ? (
            <Link
              className="rounded-xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800"
              href="/admin"
            >
              Open admin area
            </Link>
          ) : null}
          <Link
            className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-800 transition hover:bg-stone-50"
            href="/"
          >
            Back to home
          </Link>
          <form action={logout}>
            <button
              className="rounded-xl border border-stone-300 px-5 py-3 font-medium text-stone-800 transition hover:bg-stone-50"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
