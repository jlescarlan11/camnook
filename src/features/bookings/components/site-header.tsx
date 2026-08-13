import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-800"
          href="/"
        >
          CamNook
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-4 text-sm">
          <Link
            className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-amber-100"
            href="/"
          >
            Cameras
          </Link>
          <Link
            className="rounded-lg px-2 py-2 font-medium text-stone-700 hover:text-stone-950 focus:outline-none focus:ring-4 focus:ring-amber-100"
            href="/account"
          >
            Account
          </Link>
        </nav>
      </div>
    </header>
  );
}
