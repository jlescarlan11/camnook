export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-6 text-stone-950">
      <main className="w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-10 shadow-sm sm:p-16">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
          CamNook
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Camera rentals, handled with care.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600">
          The secure booking foundation is being prepared. Public rentals remain
          closed until pricing, privacy, and contract launch checks are complete.
        </p>
      </main>
    </div>
  );
}
