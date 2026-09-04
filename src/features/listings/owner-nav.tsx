import Link from "next/link";

export function OwnerNav({ current }: { current: "dashboard" | "cameras" | "bookings" }) {
  const links = [["dashboard", "/admin", "Dashboard"], ["cameras", "/admin/cameras", "Cameras"], ["bookings", "/admin/bookings", "Bookings"]] as const;
  return <nav aria-label="Owner"><ul className="flex flex-wrap gap-2">{links.map(([key, href, label]) => <li key={key}><Link aria-current={current === key ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium aria-[current=page]:bg-stone-950 aria-[current=page]:text-white" href={href}>{label}</Link></li>)}</ul></nav>;
}
