import Link from "next/link";

export default function PaymentNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-stone-950">
      <h1 className="text-3xl font-semibold">Payment review not found</h1>
      <p className="mt-3 text-stone-600">
        This payment does not exist or is no longer a current submitted transfer.
      </p>
      <Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-amber-900 underline underline-offset-4" href="/admin">
        Return to review queues
      </Link>
    </main>
  );
}
