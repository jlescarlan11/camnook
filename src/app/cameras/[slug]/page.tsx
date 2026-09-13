import { CameraLoadError } from "@/features/bookings/components/camera-load-error";
import type { Metadata } from "next";
import Link from "next/link";
import { phpFormatter } from "@/features/bookings/currency";
import { notFound } from "next/navigation";

import { CameraPhotoGallery } from "@/features/bookings/components/camera-photo-gallery";
import { CameraPhoto } from "@/features/bookings/components/camera-photo";
import { ScheduleQuoteForm } from "@/features/bookings/components/schedule-quote-form";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadPublicCamera } from "@/features/bookings/data/catalog";
import { restoreScheduleSelection } from "@/features/bookings/schedule-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Camera details | CamNook" };
type CameraPageProps = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CameraPage({ params, searchParams }: CameraPageProps) {
  const { slug } = await params;
  const result = await loadPublicCamera(slug);
  const query = await searchParams;
  const initialSchedule = result.status === "success" ? restoreScheduleSelection(query, result.camera.handoffPolicy, result.camera.availability) : undefined;
  if (result.status === "missing") notFound();
  return <div className="min-h-screen bg-white text-[#081d3b]">
    <SiteHeader />
    <main className="page-shell py-7 sm:py-10">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4" href="/">Back to cameras</Link>
      {result.status === "error" ? <CameraLoadError query={query} slug={slug} /> : <>
        <section className="mt-5 grid gap-6 border-b border-[#d8e0ea] pb-7 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
          <div className="w-32 overflow-hidden rounded-xl bg-[#f2f7ff] sm:w-full"><CameraPhoto name={result.camera.name} photo={result.camera.photos[0]} priority /></div>
          <div className="min-w-0">
            <p className="eyebrow">Published camera</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] sm:text-4xl">{result.camera.name}</h1>
            <p className="mt-2 text-sm text-[#58677d]">{result.camera.handoffPolicy?.cityLabel ?? "Handoff area unavailable"} · {phpFormatter.format(result.camera.dailyRate)} per billable day · {phpFormatter.format(result.camera.securityDeposit)} deposit</p>
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[#0b4f9c]">Kit details</summary><p className="mt-3 max-w-3xl leading-6 text-[#58677d]">{result.camera.description}</p>{result.camera.accessories.length ? <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[#58677d]">{result.camera.accessories.map((accessory) => <li key={`${accessory.name}-${accessory.quantity}`}>{accessory.quantity} × {accessory.name}</li>)}</ul> : null}</details>
          </div>
        </section>
        <CameraPhotoGallery name={result.camera.name} photos={result.camera.photos} />
        <ScheduleQuoteForm key={JSON.stringify(initialSchedule) ?? "empty"} initialSchedule={initialSchedule} availability={result.camera.availability} cameraId={result.camera.id} cameraName={result.camera.name} policy={result.camera.handoffPolicy} requestable={result.camera.requestable} />
      </>}
    </main>
  </div>;
}
