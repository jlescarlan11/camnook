export default function LoadingAdminQueue() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-stone-50 px-5"
      role="status"
    >
      <p className="rounded-xl border border-stone-200 bg-white px-6 py-5 text-stone-700">
        Loading owner operations and portfolio reporting…
      </p>
    </main>
  );
}
