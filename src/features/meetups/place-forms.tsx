"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  archiveMeetupPlace,
  assignCameraMeetupPlaces,
  saveMeetupPlace,
  searchMeetupPlaces,
  type PlaceActionState,
} from "./place-actions";
import { meetupMapUrl, type MeetupPlace } from "./places";
const PlaceMap = dynamic(() => import("./place-map").then((m) => m.PlaceMap), {
  ssr: false,
  loading: () => <p>Loading map…</p>,
});
const initial: PlaceActionState = { status: "idle" };
const input = "mt-2 w-full rounded-lg border border-stone-300 px-3 py-3";
export function MeetupPlaceForm({
  place,
}: {
  place?: MeetupPlace & { source: string };
}) {
  const [state, action, pending] = useActionState(saveMeetupPlace, initial);
  const [values, setValues] = useState({
    name: place?.name ?? "",
    address: place?.address ?? "",
    city: place?.city ?? "",
    latitude: place ? String(place.latitude) : "",
    longitude: place ? String(place.longitude) : "",
    arrival_instructions: place?.arrival_instructions ?? "",
    source: place?.source ?? "manual_pin",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState<
    Array<{
      address: string;
      city: string;
      latitude: number;
      longitude: number;
    }>
  >([]);
  const validPin =
    values.latitude.trim() !== "" &&
    values.longitude.trim() !== "" &&
    Number.isFinite(Number(values.latitude)) &&
    Number.isFinite(Number(values.longitude)) &&
    Math.abs(Number(values.latitude)) <= 90 &&
    Math.abs(Number(values.longitude)) <= 180;
  const change = (key: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setConfirmed(false);
  };
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={place?.id ?? ""} />
      <input type="hidden" name="version" value={place?.version ?? ""} />
      <input type="hidden" name="source" value={values.source} />
      <div>
        <label className="block font-medium">
          Find a public place
          <input
            className={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
          />
        </label>
        <button
          className="button-secondary mt-3"
          type="button"
          disabled={searching}
          onClick={async () => {
            setSearching(true);
            setResults([]);
            try {
              const r = await searchMeetupPlaces(query);
              setResults(r.places);
              setSearchError(
                r.error ??
                  (r.places.length
                    ? ""
                    : "No places found. Try another name or position the pin manually."),
              );
            } catch {
              setSearchError(
                "Search unavailable. You can enter a place and position its pin manually.",
              );
            } finally {
              setSearching(false);
            }
          }}
        >
          {searching ? "Searching…" : "Search places"}
        </button>
        <p role="status" className="mt-2 text-sm">
          {searchError}
        </p>
        {results.map((r, i) => (
          <button
            className="mt-2 block w-full rounded-lg border p-3 text-left"
            type="button"
            key={i}
            onClick={() => {
              setValues((v) => ({
                ...v,
                address: r.address,
                city: r.city,
                latitude: r.latitude.toFixed(6),
                longitude: r.longitude.toFixed(6),
                source: "provider_search",
              }));
              setConfirmed(false);
              setResults([]);
            }}
          >
            {r.address}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["name", "address", "city"] as const).map((key) => (
          <label key={key} className="block font-medium">
            {key === "name"
              ? "Place name"
              : key === "address"
                ? "Street address"
                : "City"}
            <input
              required
              className={input}
              name={key}
              value={values[key]}
              maxLength={key === "name" ? 200 : key === "address" ? 300 : 120}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <PlaceMap
        latitude={validPin ? Number(values.latitude) : 10.3157}
        longitude={validPin ? Number(values.longitude) : 123.8854}
        onChange={(lat, lng) => {
          setValues((v) => ({
            ...v,
            latitude: lat.toFixed(6),
            longitude: lng.toFixed(6),
          }));
          setConfirmed(false);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(["latitude", "longitude"] as const).map((key) => (
          <label className="block font-medium" key={key}>
            {key === "latitude" ? "Latitude" : "Longitude"}
            <input
              required
              type="number"
              step="0.000001"
              min={key === "latitude" ? -90 : -180}
              max={key === "latitude" ? 90 : 180}
              className={input}
              name={key}
              value={values[key]}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      {validPin ? (
        <a
          className="inline-flex min-h-11 items-center underline"
          href={meetupMapUrl(Number(values.latitude), Number(values.longitude))}
          target="_blank"
          rel="noreferrer"
        >
          View on map
        </a>
      ) : null}
      <label className="block font-medium">
        Arrival instructions <span className="font-normal">(optional)</span>
        <textarea
          className={input}
          name="arrival_instructions"
          maxLength={500}
          value={values.arrival_instructions}
          onChange={(e) => change("arrival_instructions", e.target.value)}
          placeholder="Main entrance, beside the café"
        />
      </label>
      <label className="flex gap-3">
        <input
          required
          name="confirmPin"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I checked this pin and confirm it is a public meetup place renters may
          view.
        </span>
      </label>
      {values.source === "provider_search" ? (
        <p className="text-xs text-stone-500">
          © OpenStreetMap contributors · Powered by Geoapify
        </p>
      ) : null}
      <p role={state.status === "error" ? "alert" : "status"}>
        {state.message}
      </p>
      <button
        className="button-primary"
        disabled={pending || !validPin || !confirmed}
      >
        {pending ? "Saving…" : place ? "Save changes" : "Save meetup place"}
      </button>
    </form>
  );
}
export function ArchivePlaceForm({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(archiveMeetupPlace, initial);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <button className="min-h-11 text-red-800 underline" disabled={pending}>
        Archive place
      </button>
      <p className="text-sm" role="status">
        {state.message}
      </p>
    </form>
  );
}
export function CameraMeetupPlacesForm({
  cameraId,
  places,
  selected,
}: {
  cameraId: string;
  places: MeetupPlace[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState(
    assignCameraMeetupPlaces,
    initial,
  );
  const [ids, setIds] = useState(selected);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="camera" value={cameraId} />
      <p>
        Choose up to three public places you can use at this camera’s pickup and
        return times. Use the arrows to order them.
      </p>
      {ids.map((id) => (
        <input key={id} type="hidden" name="places" value={id} />
      ))}
      {places.map((p) => (
        <label className="flex gap-3 rounded-lg border p-4" key={p.id}>
          <input
            type="checkbox"
            checked={ids.includes(p.id)}
            disabled={!ids.includes(p.id) && ids.length >= 3}
            onChange={(e) =>
              setIds((v) =>
                e.target.checked ? [...v, p.id] : v.filter((id) => id !== p.id),
              )
            }
          />
          <span>
            <strong>{p.name}</strong>
            <span className="block text-sm">{p.address}</span>
          </span>
        </label>
      ))}
      {ids.map((id, i) => (
        <div className="flex items-center gap-3" key={id}>
          <span>
            {i + 1}. {places.find((p) => p.id === id)?.name}
          </span>
          <button
            type="button"
            disabled={i === 0}
            className="min-h-11 underline disabled:opacity-40"
            onClick={() =>
              setIds((v) => {
                const n = [...v];
                [n[i - 1], n[i]] = [n[i], n[i - 1]];
                return n;
              })
            }
          >
            Move up
          </button>
        </div>
      ))}
      {!ids.length ? (
        <p className="text-amber-900">
          Assign a place to allow new rental requests.
        </p>
      ) : null}
      <Link className="block underline" href="/admin/meetup-places">
        Manage meetup places
      </Link>
      <p role={state.status === "error" ? "alert" : "status"}>
        {state.message}
      </p>
      <button className="button-primary" disabled={pending}>
        {pending ? "Saving…" : "Save meetup choices"}
      </button>
    </form>
  );
}
