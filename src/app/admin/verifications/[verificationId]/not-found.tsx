import Link from "next/link";

export default function AdminVerificationNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold">Review is no longer available</h1>
      <p className="mt-3 text-stone-600">
        This submission may have been decided, superseded, deleted, or expired.
      </p>
      <Link className="mt-5 inline-flex font-semibold underline" href="/admin">
        Return to the current queue
      </Link>
    </main>
  );
}
