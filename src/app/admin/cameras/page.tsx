import Link from "next/link";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadOwnerCameras } from "@/features/listings/owner-data";
import { OwnerNav } from "@/features/listings/owner-nav";
import { UnpublishCameraForm } from "@/features/listings/owner-camera-forms";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function OwnerCamerasPage() {
  const context = await requirePageAdmin("/admin/cameras");
  const result = await loadOwnerCameras(context);
  return <div className="min-h-screen bg-stone-50 text-stone-950"><SiteHeader /><main className="page-shell py-8 sm:py-12">
    <OwnerNav current="cameras" />
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4"><h1 className="page-title">Cameras</h1><Link className="button-primary" href="/admin/cameras/new">Add camera</Link></div>
    {result.status === "error" ? <p className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">Your cameras could not be loaded.</p> : result.cameras.length === 0 ? <div className="surface mt-8 p-8 text-center"><h2 className="text-xl font-semibold">No cameras yet</h2><Link className="button-primary mt-5" href="/admin/cameras/new">Add camera</Link></div> : <ul className="mt-8 border-t border-stone-200">{result.cameras.map((camera) => <li className="border-b border-stone-200 py-6" key={camera.id}><div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center"><div><h2 className="text-xl font-semibold">{camera.name}</h2><p className="mt-1 text-sm font-medium text-[#0b4f9c]">{camera.status === "published" ? "Published" : "Draft"}</p></div><div><p className="text-sm font-semibold">{camera.upcoming_rentals} upcoming</p><p className="mt-1 text-xs text-stone-500">{camera.photo_count} {camera.photo_count === 1 ? "photo" : "photos"} · {camera.handoff?.enabled ? "Available" : "Needs availability"}</p></div><div className="flex flex-wrap gap-2"><Link className="button-primary" href={`/admin/cameras/${camera.id}`}>{camera.status === "draft" ? "Continue setup" : "Manage"}</Link>{camera.status === "published" ? <><Link className="button-secondary" href={`/cameras/${camera.slug}`}>View listing</Link><UnpublishCameraForm cameraId={camera.id} /></> : null}</div></div></li>)}</ul>}
  </main></div>;
}
