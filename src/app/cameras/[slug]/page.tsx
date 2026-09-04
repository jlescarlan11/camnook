import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CameraPhoto } from "@/features/bookings/components/camera-photo";
import { ScheduleQuoteForm } from "@/features/bookings/components/schedule-quote-form";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadPublicCamera } from "@/features/bookings/data/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Camera details | CamNook",
};

type CameraPageProps = { params: Promise<{ slug: string }> };

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export default async function CameraPage({ params }: CameraPageProps) {
  const { slug } = await params;
  const result = await loadPublicCamera(slug);
  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline decoration-amber-300 underline-offset-4" href="/">
          ← Back to cameras
        </Link>
        {result.status === "error" ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h1 className="text-2xl font-semibold">Camera details unavailable</h1>
            <p className="mt-2 leading-7">We couldn’t load this camera. Please return to the catalog and try again.</p>
          </div>
        ) : (
          <div className="mt-6 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <article className="min-w-0 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <CameraPhoto name={result.camera.name} photo={result.camera.photos[0]} priority />
              <div className="p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Published camera</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{result.camera.name}</h1>
                <p className="mt-5 leading-8 text-stone-600">{result.camera.description}</p>
                <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                  <DetailValue label="Current daily rate" value={phpFormatter.format(result.camera.dailyRate)} />
                  <DetailValue label="Security deposit" value={phpFormatter.format(result.camera.securityDeposit)} />
                </dl>
                <p className="mt-4 text-sm text-stone-700">
                  Service area: {result.camera.handoffPolicy?.cityLabel ?? "Currently unavailable"}
                </p>

                <section className="mt-8 border-t border-stone-200 pt-7">
                  <h2 className="text-xl font-semibold">Fixed inclusions</h2>
                  {result.camera.accessories.length ? (
                    <ul className="mt-4 space-y-2 pl-5 text-stone-700">
                      {result.camera.accessories.map((accessory) => (
                        <li key={`${accessory.name}-${accessory.quantity}`}>
                          {accessory.quantity} × {accessory.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-stone-600">No fixed inclusions are listed.</p>
                  )}
                </section>

              </div>
            </article>
            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
              <ScheduleQuoteForm
                availability={result.camera.availability}
                cameraId={result.camera.id}
                cameraName={result.camera.name}
                policy={result.camera.handoffPolicy}
                requestable={result.camera.requestable}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
