import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-[#d8e0ea] bg-white">
      <div className="page-shell flex min-h-18 items-center justify-between gap-4 py-4">
        <Link
          className="text-base font-bold uppercase tracking-[0.26em] text-[#081d3b]"
          href="/"
        >
          CamNook
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2 text-sm sm:gap-6">
          <Link
            className="rounded-md px-2 py-2 font-medium text-[#58677d] hover:text-[#081d3b]"
            href="/"
          >
            Cameras
          </Link>
          <Link
            className="rounded-md px-2 py-2 font-medium text-[#58677d] hover:text-[#081d3b]"
            href="/account"
          >
            Your rentals
          </Link>
        </nav>
      </div>
    </header>
  );
}
