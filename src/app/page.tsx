import type { Metadata } from "next";
import Link from "next/link";
import { phpFormatter } from "@/features/bookings/currency";

import { CameraPhoto } from "@/features/bookings/components/camera-photo";
import { KitInfo } from "@/features/bookings/components/kit-info";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { canScheduleRental } from "@/features/bookings/scheduling";
import { loadCatalog, publicCatalogPresentation } from "@/features/bookings/data/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { description: "Browse CamNook’s real published camera rental catalog.", title: "Camera rentals | CamNook" };


export default async function Home() {
  const presentation = publicCatalogPresentation(await loadCatalog());
  return (
    <div className="min-h-screen bg-white text-[#081d3b]">
      <SiteHeader activeSection="cameras" />
      <main className="page-shell spotlight-catalog">
        <header className="spotlight-intro">
          <h1>Make room for your next shot.</h1>
          <p>Rent a camera, kit up, and get out there.</p>
        </header>
        <section aria-label="Camera rentals">
          {presentation.kind === "ready" ? (
            <ul className="spotlight-list">
              {presentation.cameras.map((camera, index) => {
                const canSchedule = canScheduleRental(camera.handoffPolicy, camera.requestable);
                return (
                  <li className="camera-spotlight" key={camera.id}>
                    <div className="spotlight-photo">
                      <CameraPhoto name={camera.name} photo={camera.photos[0]} priority={index === 0} spotlight />
                    </div>
                    <div className="spotlight-name">
                      <h2>{camera.name}</h2>
                      <KitInfo name={camera.name} description={camera.description} pickup={camera.handoffPolicy?.cityLabel ?? null} />
                    </div>
                    {!canSchedule ? <p className="mt-3 text-sm font-medium text-[#754000]">Not accepting rental requests right now</p> : null}
                    <dl className="spotlight-pricing">
                      <div>
                        <dt>Rental rate</dt>
                        <dd>{phpFormatter.format(camera.dailyRate)} <span>per day</span></dd>
                      </div>
                      <div>
                        <dt>Security deposit</dt>
                        <dd>{phpFormatter.format(camera.securityDeposit)}</dd>
                      </div>
                    </dl>
                    <Link className={`${canSchedule ? "button-primary" : "button-secondary"} spotlight-action`} href={`/cameras/${camera.slug}`} aria-label={`${canSchedule ? "Check dates" : "View details"} for ${camera.name}`}>
                      {canSchedule ? "Check dates" : "View details"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={`catalog-message ${presentation.kind === "error" ? "text-red-900" : "text-[#58677d]"}`} role={presentation.kind === "error" ? "alert" : "status"}>
              <p>{presentation.message}</p>
              {presentation.kind === "error" ? <Link className="button-secondary mt-5" href="/">Try loading the catalog again</Link> : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
