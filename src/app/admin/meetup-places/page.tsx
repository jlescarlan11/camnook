import { randomUUID } from "node:crypto";

import { requirePageAdmin } from "@/lib/auth/require-admin";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { OwnerNav } from "@/features/listings/owner-nav";
import {
  MeetupPlaceForm,
  ArchivePlaceForm,
} from "@/features/meetups/place-forms";
import { placeSchema, meetupMapUrl } from "@/features/meetups/places";
import { z } from "zod";
export const dynamic = "force-dynamic";
export default async function MeetupPlacesPage() {
  const context = await requirePageAdmin("/admin/meetup-places");
  const result = await context.supabase
    .from("meetup_places")
    .select("*")
    .is("archived_at", null)
    .order("name");
  const parsed = z
    .array(placeSchema.extend({ source: z.string() }))
    .safeParse(result.data);
  return (
    <div>
      <SiteHeader />
      <main className="page-shell py-8">
        <OwnerNav current="meetups" />
        <h1 className="page-title mt-8">Meetup places</h1>
        <p className="mt-3">
          Save public places and assign them to cameras. Existing bookings keep
          the place originally selected.
        </p>
        {result.error || !parsed.success ? (
          <p role="alert" className="mt-6">
            Meetup places could not be loaded. Reload before making changes.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {parsed.data.map((p) => (
              <section
                className="rounded-xl border p-6"
                key={`${p.id}-${p.version}`}
              >
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p>{p.address}</p>
                <a
                  className="inline-flex min-h-11 items-center underline"
                  href={meetupMapUrl(p.latitude, p.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on map
                </a>
                <details className="mt-3">
                  <summary className="cursor-pointer py-3 font-semibold">
                    Edit place
                  </summary>
                  <MeetupPlaceForm place={p} />
                </details>
                <ArchivePlaceForm id={p.id} version={p.version} />
              </section>
            ))}
            <section className="rounded-xl border p-6">
              <h2 className="mb-6 text-2xl font-semibold">Add meetup place</h2>
              <MeetupPlaceForm creationId={randomUUID()} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
