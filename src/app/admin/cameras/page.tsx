import Link from "next/link";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadOwnerCameras } from "@/features/listings/owner-data";
import { OwnerNav } from "@/features/listings/owner-nav";
import { unpublishCamera } from "@/features/listings/owner-actions";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function OwnerCamerasPage() {
  const context = await requirePageAdmin("/admin/cameras");
  const result = await loadOwnerCameras(context);
  return <div className="min-h-screen bg-stone-100 text-stone-950"><SiteHeader /><main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
    <OwnerNav current="cameras" />
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Inventory</p><h1 className="mt-2 text-4xl font-semibold">Your cameras</h1></div><Link className="inline-flex min-h-12 items-center rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white" href="/admin/cameras/new">+ Add camera</Link></div>
    {result.status === "error" ? <p className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">Your cameras could not be loaded.</p> : result.cameras.length === 0 ? <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-8 text-center"><h2 className="text-xl font-semibold">Add your first camera</h2><p className="mt-2 text-stone-600">Create a listing, set availability, preview it, then publish.</p></div> : <ul className="mt-8 space-y-4">{result.cameras.map((camera) => <li className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6" key={camera.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{camera.name}</h2><p className="mt-1 text-sm text-stone-600">{camera.status === "published" ? "Published" : "Draft"} · {camera.upcoming_rentals} upcoming {camera.upcoming_rentals === 1 ? "rental" : "rentals"}</p><p className="mt-1 text-sm text-stone-500">{camera.photo_count} {camera.photo_count === 1 ? "photo" : "photos"} · {camera.handoff?.enabled ? "Availability set" : "Availability incomplete"}</p></div><div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white" href={`/admin/cameras/${camera.id}`}>{camera.status === "draft" ? "Continue setup" : "Manage"}</Link>{camera.status === "published" ? <><Link className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 px-4 py-2 font-semibold" href={`/cameras/${camera.slug}`}>View listing</Link><form action={unpublishCamera}><input name="cameraId" type="hidden" value={camera.id} /><button className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-semibold" type="submit">Unpublish</button></form></> : null}</div></div></li>)}</ul>}
  </main></div>;
}
