import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { OwnerOperationsPanel } from "@/features/portfolio/owner-dashboard";
import { requirePageUser } from "@/lib/auth/require-user";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Action needed | CamNook" };
export default async function AdminPage() { const context = await requirePageUser("/admin"); const data = await loadAdminDashboardContext(context, null); if ("forbidden" in data) redirect("/forbidden"); return <div className="min-h-screen bg-stone-100 text-stone-950"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><AdminNav current="operations" /><h1 className="mt-6 text-4xl font-semibold">Action needed</h1><p className="mt-2 text-stone-600">Non-zero owner work from the current authoritative snapshot.</p>{data.operations.status === "success" ? <OwnerOperationsPanel dashboard={data.operations.dashboard} /> : <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5" role="alert">Current operations could not be verified. <Link className="font-semibold underline" href="/admin">Retry</Link></p>}</main></div>; }
export function AdminNav({ current }: { current: "operations" | "queues" | "settings" | "reports" }) { const links = [["operations", "/admin", "Action needed"], ["queues", "/admin/queues", "All queues"], ["settings", "/admin/settings", "Settings"], ["reports", "/admin/reports", "Reports"]] as const; return <nav aria-label="Admin"><ul className="flex flex-wrap gap-2">{links.map(([key, href, label]) => <li key={key}><Link aria-current={current === key ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium aria-[current=page]:bg-stone-950 aria-[current=page]:text-white" href={href}>{label}</Link></li>)}</ul></nav>; }
