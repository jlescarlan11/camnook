export default function LoadingAdminQueue() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-stone-100 px-5"
      role="status"
    >
      <p className="rounded-2xl border border-stone-200 bg-white px-6 py-5 text-stone-700 shadow-sm">
        Loading owner operations and portfolio reporting…
      </p>
    </main>
  );
}
