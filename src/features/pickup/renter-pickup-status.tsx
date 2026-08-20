"use client";

import { useActionState } from "react";

import { formatManilaDateTime } from "@/features/bookings/manila-time";

import {
  requestMyConditionPhotoAccess,
  type ConditionPhotoActionState,
} from "./actions";
import type { MyPickupState } from "./types";
import type { SafeMeetupPlan } from "@/features/meetups/plan";

const initialAccessState: ConditionPhotoActionState = { status: "idle" };

type InstructionsResult =
  | { contact: string; location: string; process: string }
  | null;

export function RenterPickupStatus({
  instructions,
  meetup,
  pickup,
}: {
  instructions: InstructionsResult;
  meetup: SafeMeetupPlan | null;
  pickup: MyPickupState;
}) {
  const [accessState, accessAction, accessPending] = useActionState(
    requestMyConditionPhotoAccess,
    initialAccessState,
  );

  return (
    <>
      {pickup.booking_state === "CONFIRMED" ? (
        <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="pickup-instructions-heading">
          <h2 className="text-lg font-semibold" id="pickup-instructions-heading">Pickup instructions</h2>
          {instructions ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Value label="Schedule" value={formatManilaDateTime(pickup.pickup_at)} />
              <Value
                label="Location"
                value={meetup ? `${meetup.name} — ${meetup.address}` : instructions.location}
              />
              <Value label="Contact" value={instructions.contact} />
              <Value label="Process" value={instructions.process} />
              <Value label="Bring" value="Your original current government ID. The named renter must collect in person; substitutes are not allowed." />
            </dl>
          ) : (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">Pickup instructions are temporarily unavailable. Do not travel until the location and contact details reload.</p>
          )}
        </section>
      ) : null}

      {pickup.handoff ? (
        <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="active-rental-heading">
          <h2 className="text-lg font-semibold" id="active-rental-heading">Active rental handoff</h2>
          <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Pickup completed {formatManilaDateTime(pickup.handoff.actual_at)}. The rental is ACTIVE.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Value label="Identity handoff" value="Named renter and original ID checked" />
            <Value label="Equipment handoff" value="Camera and all included accessories checked" />
            <Value label="Starting condition" value="Written condition report recorded" />
            <Value label="Expected return" value={formatManilaDateTime(pickup.return_at)} />
            {meetup ? (
              <Value label="Return meetup" value={`${meetup.name} — ${meetup.address}`} />
            ) : null}
          </dl>
          {pickup.handoff.photos.length > 0 ? (
            <div className="mt-5">
              <h3 className="font-semibold">Private starting-condition photos</h3>
              <ul className="mt-3 space-y-3">
                {pickup.handoff.photos.map((photo, index) => (
                  <li className="rounded-xl bg-stone-50 p-4" key={photo.photo_id}>
                    <p className="text-sm">Photo {index + 1} · {Math.ceil(photo.byte_size / 1024)} KiB</p>
                    <form action={accessAction} className="mt-2">
                      <input name="bookingId" type="hidden" value={pickup.booking_id} />
                      <input name="photoId" type="hidden" value={photo.photo_id} />
                      <button className="min-h-11 font-semibold text-amber-900 underline disabled:opacity-60" disabled={accessPending} type="submit">Open private photo for 60 seconds</button>
                    </form>
                  </li>
                ))}
              </ul>
              {accessState.status === "success" && accessState.signedUrl ? <a className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href={accessState.signedUrl} rel="noopener noreferrer" target="_blank">View your private condition photo</a> : accessState.status === "error" ? <p className="mt-3 text-sm text-red-800" role="alert">The private photo could not be authorized. Retry from this owned booking.</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <details className="mt-7 rounded-xl border border-stone-200 p-4">
        <summary className="cursor-pointer font-semibold">Owned booking timeline</summary>
        <ol className="mt-4 space-y-3 text-sm">
          {pickup.timeline.map((event, index) => (
            <li key={`${event.occurred_at}-${event.to_state}-${index}`}>
              <span className="font-semibold">{event.to_state}</span> · {formatManilaDateTime(event.occurred_at)}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-4"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}
