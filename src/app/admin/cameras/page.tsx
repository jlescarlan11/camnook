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
  return <div className="min-h-screen bg-stone-50 text-stone-950"><SiteHeader /><main className="page-shell py-8 sm:py-12">
    <OwnerNav current="cameras" />
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Inventory</p><h1 className="page-heading mt-2">Your cameras</h1><p className="mt-3 text-stone-600">Availability, upcoming rentals, and publishing status.</p></div><Link className="button-primary" href="/admin/cameras/new">Add camera</Link></div>
    {result.status === "error" ? <p className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">Your cameras could not be loaded.</p> : result.cameras.length === 0 ? <div className="surface mt-8 p-8 text-center"><h2 className="text-xl font-semibold">Add your first camera</h2><p className="mt-2 text-stone-600">Create a listing, set availability, preview it, then publish.</p></div> : <ul className="mt-8 border-t border-stone-200">{result.cameras.map((camera) => <li className="border-b border-stone-200 py-6" key={camera.id}><div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center"><div><h2 className="text-xl font-semibold">{camera.name}</h2><p className="mt-1 text-sm font-medium text-[#0b4f9c]">{camera.status === "published" ? "Published" : "Draft"}</p></div><div><p className="text-sm font-semibold">{camera.upcoming_rentals} upcoming</p><p className="mt-1 text-xs text-stone-500">{camera.photo_count} {camera.photo_count === 1 ? "photo" : "photos"} · {camera.handoff?.enabled ? "Availability set" : "Availability incomplete"}</p></div><div className="flex flex-wrap gap-2"><Link className="button-primary" href={`/admin/cameras/${camera.id}`}>{camera.status === "draft" ? "Continue setup" : "Manage"}</Link>{camera.status === "published" ? <><Link className="button-secondary" href={`/cameras/${camera.slug}`}>View listing</Link><form action={unpublishCamera}><input name="cameraId" type="hidden" value={camera.id} /><button className="button-secondary" type="submit">Unpublish</button></form></> : null}</div></div></li>)}</ul>}
  </main></div>;
}
