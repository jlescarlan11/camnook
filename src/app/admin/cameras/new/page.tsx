import Link from "next/link";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { CameraDetailsForm } from "@/features/listings/owner-camera-forms";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export default async function NewCameraPage() {
  await requirePageAdmin("/admin/cameras/new");
  return <div className="min-h-screen bg-stone-100 text-stone-950"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12"><OwnerNav current="cameras" /><Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href="/admin/cameras">← Back to cameras</Link><section className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Step 1 of 4</p><h1 className="mt-2 text-3xl font-semibold">Camera</h1><p className="mt-2 text-stone-600">Start with the information renters need to compare this camera.</p><div className="mt-7"><CameraDetailsForm /></div></section></main></div>;
}
