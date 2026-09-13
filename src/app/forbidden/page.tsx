import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access denied | CamNook",
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12 text-stone-950">
      <section className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-8 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-3 text-stone-600">This area is for the CamNook owner.</p>
        <Link
          className="mt-8 inline-block rounded-xl bg-stone-950 px-5 py-3 font-medium text-white"
          href="/account"
        >
          Go to your rentals
        </Link>
      </section>
    </main>
  );
}
