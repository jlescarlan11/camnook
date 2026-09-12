import type { Metadata } from "next";
import Link from "next/link";

import { CameraPhoto } from "@/features/bookings/components/camera-photo";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { canScheduleRental } from "@/features/bookings/scheduling";
import { loadCatalog, publicCatalogPresentation, publicServiceAreaPresentation } from "@/features/bookings/data/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { description: "Browse CamNook’s real published camera rental catalog.", title: "Camera rentals | CamNook" };

const phpFormatter = new Intl.NumberFormat("en-PH", { currency: "PHP", maximumFractionDigits: 0, style: "currency" });

export default async function Home() {
  const presentation = publicCatalogPresentation(await loadCatalog());
  return <div className="min-h-screen bg-white text-[#081d3b]">
    <SiteHeader />
    <main className="page-shell py-10 sm:py-16">
      <section className="grid gap-8 border-b border-[#d8e0ea] pb-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end sm:pb-14">
        <div>
          <p className="eyebrow">{presentation.kind === "ready" ? publicServiceAreaPresentation(presentation.cameras) : "Owner-operated camera rentals in the Philippines"}</p>
          <h1 className="page-heading mt-4 max-w-3xl">Choose the camera, then plan the time.</h1>
        </div>
        <p className="max-w-xl text-base leading-7 text-[#58677d]">See the real kit, check valid pickup and return dates, and get a Philippine-peso estimate before signing in.</p>
      </section>

      <section aria-labelledby="catalog-heading" className="py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">Published cameras</p><h2 className="section-heading mt-3" id="catalog-heading">Available to consider</h2></div>
          <p className="max-w-md text-sm leading-6 text-[#58677d]">Published means the listing is visible. Your dates are checked before you can request it.</p>
        </div>
        {presentation.kind === "ready" ? <ul className="mt-8 divide-y divide-[#d8e0ea] border-y border-[#d8e0ea]">
          {presentation.cameras.map((camera, index) => {
            const canSchedule = canScheduleRental(camera.handoffPolicy, camera.requestable);
            return <li className="grid gap-7 py-8 md:grid-cols-[17rem_minmax(0,1fr)_auto] md:items-center" key={camera.id}>
            <div className="overflow-hidden rounded-xl bg-[#f2f7ff]"><CameraPhoto name={camera.name} photo={camera.photos[0]} priority={index === 0} /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0b4f9c]">{camera.handoffPolicy?.cityLabel ?? "Handoff area unavailable"}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">{camera.name}</h3>
              {!canSchedule ? <p className="mt-2 text-sm font-medium text-[#754000]">Not accepting rental requests right now</p> : null}
              <p className="mt-3 max-w-2xl leading-7 text-[#58677d]">{camera.description}</p>
              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div><dt className="text-[#58677d]">Rental rate</dt><dd className="mt-1 font-semibold">{phpFormatter.format(camera.dailyRate)} per billable day</dd></div>
                <div><dt className="text-[#58677d]">Security deposit</dt><dd className="mt-1 font-semibold">{phpFormatter.format(camera.securityDeposit)}</dd></div>
              </dl>
            </div>
            <Link className={`${canSchedule ? "button-primary" : "button-secondary"} w-full md:w-auto`} href={`/cameras/${camera.slug}`}>{canSchedule ? "Check dates" : "View details"}</Link>
          </li>; })}
        </ul> : <div className={`mt-8 rounded-xl border p-6 text-sm leading-6 ${presentation.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-[#d8e0ea] bg-[#f7f9fc] text-[#58677d]"}`} role={presentation.kind === "error" ? "alert" : "status"}>
          <p>{presentation.message}</p>{presentation.kind === "error" ? <Link className="mt-3 inline-block font-semibold underline underline-offset-4" href="/">Try loading the catalog again</Link> : null}
        </div>}
      </section>
    </main>
  </div>;
}
