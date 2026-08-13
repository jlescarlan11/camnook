import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | CamNook",
};

export default async function AdminPage() {
  const { user } = await requirePageAdmin("/admin");

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-12 text-stone-50">
      <section className="mx-auto max-w-4xl rounded-3xl border border-stone-700 bg-stone-900 p-8 shadow-2xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-400">
          Authorized admin
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          CamNook operations
        </h1>
        <p className="mt-4 text-stone-400">Signed in as {user.email}</p>
        <div className="mt-8 rounded-2xl border border-amber-800/60 bg-amber-950/40 p-5 text-sm leading-6 text-amber-100">
          Booking approval, government-ID uploads, paid cancellation acceptance,
          and private-object admin access remain intentionally disabled until
          their launch decisions are approved.
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-amber-400 px-5 py-3 font-medium text-stone-950 transition hover:bg-amber-300"
            href="/account"
          >
            Account
          </Link>
          <form action={logout}>
            <button
              className="rounded-xl border border-stone-600 px-5 py-3 font-medium text-stone-100 transition hover:bg-stone-800"
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
