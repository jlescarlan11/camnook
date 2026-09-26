import Link from "next/link";

export function SiteHeader({ activeSection, activeSectionCurrent = "page" }: {
  activeSection?: "cameras" | "rentals" | "profile";
  activeSectionCurrent?: "page" | "location";
} = {}) {
  return (
    <header className="site-header border-b border-[#e2e5ea] bg-white">
      <div className="page-shell flex min-h-17 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
        <Link
          className="text-base sm:text-lg font-bold uppercase tracking-[0.26em] text-[#081d3b]"
          href="/"
        >
          CamNook
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 text-sm sm:gap-6">
          {([
            { section: "cameras", href: "/", label: "Cameras" },
            { section: "rentals", href: "/account", label: "Your rentals" },
            { section: "profile", href: "/account/profile", label: "Profile" },
          ] as const).map(({ section, href, label }) => (
            <Link
              key={section}
              aria-current={activeSection === section ? activeSectionCurrent : undefined}
              className={`inline-flex min-h-11 items-center rounded-md px-2 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b4f9c] ${activeSection === section ? "bg-[#edf3fc] text-[#0b4f9c]" : "text-[#58677d] hover:text-[#081d3b]"}`}
              href={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
