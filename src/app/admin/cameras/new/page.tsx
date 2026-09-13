import Link from "next/link";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { CameraDetailsForm } from "@/features/listings/owner-camera-forms";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export default async function NewCameraPage() {
  await requirePageAdmin("/admin/cameras/new");
  return <div className="min-h-screen bg-stone-50 text-stone-950"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12"><OwnerNav current="cameras" /><Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-[#0b4f9c] underline" href="/admin/cameras">← Cameras</Link><section className="mt-5 rounded-xl border border-stone-200 bg-white p-6 sm:p-8"><p className="text-sm font-semibold text-[#0b4f9c]">Step 1 of 3</p><h1 className="mt-2 text-3xl font-semibold">Add camera</h1><div className="mt-7"><CameraDetailsForm /></div></section></main></div>;
}
