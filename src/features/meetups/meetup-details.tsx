import { meetupMapUrl } from "./places";
import type { SafeMeetupPlan } from "./plan";
export function MeetupDetails({ meetup }: { meetup: SafeMeetupPlan }) {
  if (meetup.kind === "canonical_area")
    return <p>{meetup.areaLabel} — exact meetup needs coordination.</p>;
  return (
    <div className="space-y-2">
      <p className="font-semibold">{meetup.name}</p>
      <p>{meetup.address}</p>
      {meetup.kind === "lender_place" && meetup.arrivalInstructions ? (
        <p>{meetup.arrivalInstructions}</p>
      ) : null}
      <p className="text-sm text-stone-500">Pickup and return at this place.</p>
      <a
        className="inline-flex min-h-11 items-center font-semibold underline"
        target="_blank"
        rel="noreferrer"
        href={meetupMapUrl(meetup.latitude, meetup.longitude, true)}
      >
        Directions
      </a>
      <details className="text-sm">
        <summary className="cursor-pointer py-2">Coordinates</summary>
        <p className="select-all">
          {meetup.latitude.toFixed(6)}, {meetup.longitude.toFixed(6)}
        </p>
      </details>
      {meetup.attribution ? (
        <p className="text-xs text-stone-500">{meetup.attribution}</p>
      ) : null}
    </div>
  );
}
