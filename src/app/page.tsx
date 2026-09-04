import type { Metadata } from "next";
import Link from "next/link";

import { CameraPhoto } from "@/features/bookings/components/camera-photo";
import { SiteHeader } from "@/features/bookings/components/site-header";
import {
  loadCatalog,
  publicCatalogPresentation,
  publicServiceAreaPresentation,
} from "@/features/bookings/data/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Browse CamNook’s real published camera rental catalog.",
  title: "Camera rentals | CamNook",
};

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export default async function Home() {
  const presentation = publicCatalogPresentation(await loadCatalog());

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main>
        <section className="border-b border-stone-200 bg-stone-950 px-5 py-14 text-white sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-400">
              {presentation.kind === "ready"
                ? publicServiceAreaPresentation(presentation.cameras)
                : "Owner-operated camera rentals in the Philippines"}
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Real cameras, clear estimates, careful handoffs.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-stone-300 sm:text-lg">
              Browse currently published gear and request a rental using times
              explicitly interpreted in Philippine time.
            </p>
          </div>
        </section>

        <section aria-labelledby="catalog-heading" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
                Published catalog
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight" id="catalog-heading">
                Cameras available to consider
              </h2>
            </div>
          </div>

          {presentation.kind === "ready" ? (
            <ul className="mt-8 grid list-none gap-6 p-0 md:grid-cols-2">
              {presentation.cameras.map((camera, index) => (
                <li className="min-w-0 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" key={camera.id}>
                  <CameraPhoto
                    name={camera.name}
                    photo={camera.photos[0]}
                    priority={index === 0}
                  />
                  <div className="p-6 sm:p-8">
                    <h3 className="text-2xl font-semibold tracking-tight">{camera.name}</h3>
                    <p className="mt-3 line-clamp-3 leading-7 text-stone-600">{camera.description}</p>
                    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-stone-50 p-3">
                        <dt className="text-stone-500">Daily rate</dt>
                        <dd className="mt-1 font-semibold">{phpFormatter.format(camera.dailyRate)}</dd>
                      </div>
                      <div className="rounded-xl bg-stone-50 p-3">
                        <dt className="text-stone-500">Deposit</dt>
                        <dd className="mt-1 font-semibold">{phpFormatter.format(camera.securityDeposit)}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-sm text-stone-700">
                      Service area: {camera.handoffPolicy?.cityLabel ?? "Currently unavailable"}
                    </p>
                    <Link
                      className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 font-medium text-white hover:bg-stone-800 focus:outline-none focus:ring-4 focus:ring-amber-100 sm:w-auto"
                      href={`/cameras/${camera.slug}`}
                    >
                      View availability and quote
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className={`mt-8 rounded-2xl border p-6 text-sm leading-6 ${presentation.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-700"}`}
              role={presentation.kind === "error" ? "alert" : "status"}
            >
              <p>{presentation.message}</p>
              {presentation.kind === "error" ? (
                <Link className="mt-3 inline-block font-semibold underline underline-offset-4" href="/">
                  Try loading the catalog again
                </Link>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
