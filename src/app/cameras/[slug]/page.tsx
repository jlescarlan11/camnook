import { CameraLoadError } from "@/features/bookings/components/camera-load-error";
import type { Metadata } from "next";
import Link from "next/link";
import { phpFormatter } from "@/features/bookings/currency";
import { notFound } from "next/navigation";

import { CameraPhotoGallery } from "@/features/bookings/components/camera-photo-gallery";
import { KitInfo } from "@/features/bookings/components/kit-info";
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
        <div className="camera-detail-layout">
          <CameraPhotoGallery name={result.camera.name} photos={result.camera.photos} />
          <div className="camera-detail-booking">
            <div className="camera-detail-title">
              <h1>{result.camera.name}</h1>
              <KitInfo name={result.camera.name} description={[result.camera.description, ...result.camera.accessories.map((item) => `${item.quantity} × ${item.name}`)].join(" · ")} pickup={result.camera.handoffPolicy?.cityLabel ?? null} />
            </div>
            <p className="camera-detail-price">{phpFormatter.format(result.camera.dailyRate)} / day <span>· {phpFormatter.format(result.camera.securityDeposit)} security deposit</span></p>
        <ScheduleQuoteForm compact key={JSON.stringify(initialSchedule) ?? "empty"} initialSchedule={initialSchedule} availability={result.camera.availability} cameraId={result.camera.id} cameraName={result.camera.name} policy={result.camera.handoffPolicy} requestable={result.camera.requestable} />
          </div>
        </div>
      </>}
    </main>
  </div>;
}
