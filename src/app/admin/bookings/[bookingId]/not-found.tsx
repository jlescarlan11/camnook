import Link from "next/link";

export default function AdminBookingNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          Booking not found
        </h1>
        <p className="mt-3 leading-7 text-stone-600">
          This persisted booking is unavailable. Return to the current queue.
        </p>
        <Link
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-stone-950 px-5 py-3 font-medium text-white"
          href="/admin"
        >
          Return to review queue
        </Link>
      </section>
    </main>
  );
}
