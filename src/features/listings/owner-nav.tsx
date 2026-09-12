import Link from "next/link";

type OwnerPage = "dashboard" | "cameras" | "bookings" | "reports" | "settings";

export function OwnerNav({ current }: { current: OwnerPage }) {
  const links = [
    ["dashboard", "/admin", "Today"],
    ["bookings", "/admin/bookings", "Bookings"],
    ["cameras", "/admin/cameras", "Cameras"],
    ["reports", "/admin/reports", "Reports"],
    ["settings", "/admin/settings", "Settings"],
  ] as const;

  return (
    <nav aria-label="Owner" className="overflow-x-auto border-b border-[#d8e0ea]">
      <ul className="flex min-w-max gap-7">
        {links.map(([key, href, label]) => (
          <li key={key}>
            <Link
              aria-current={current === key ? "page" : undefined}
              className="inline-flex min-h-12 items-center border-b-2 border-transparent text-sm font-medium text-[#58677d] hover:text-[#081d3b] aria-[current=page]:border-[#0b4f9c] aria-[current=page]:font-semibold aria-[current=page]:text-[#081d3b]"
              href={href}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
