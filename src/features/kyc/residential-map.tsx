"use client";

import { useEffect, useRef, useState } from "react";

import type { DraftPin } from "./residential-pin-picker";

type Suggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

const CEBU_CENTER = { latitude: 10.3157, longitude: 123.8854 };

export function ResidentialMap({
  initialPin,
  mapKey,
  onDraftChange,
}: {
  initialPin: DraftPin | null;
  mapKey: string;
  onDraftChange: (pin: DraftPin) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onDraftChange);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState("");
  const [latitude, setLatitude] = useState(String(initialPin?.latitude ?? CEBU_CENTER.latitude));
  const [longitude, setLongitude] = useState(String(initialPin?.longitude ?? CEBU_CENTER.longitude));

  useEffect(() => { callback.current = onDraftChange; }, [onDraftChange]);

  useEffect(() => {
    if (!container.current || !mapKey) return;
    let disposed = false;
    let cleanup = () => {};
    void import("leaflet").then((leaflet) => {
      if (disposed || !container.current) return;
      const center = initialPin ?? CEBU_CENTER;
      const map = leaflet.map(container.current, { scrollWheelZoom: false })
        .setView([center.latitude, center.longitude], initialPin ? 17 : 12);
      leaflet.tileLayer(
        `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(mapKey)}`,
        {
          attribution: "© OpenStreetMap contributors · Powered by Geoapify",
          maxZoom: 20,
        },
      ).addTo(map);
      const marker = leaflet.marker([center.latitude, center.longitude], {
        draggable: true,
        icon: leaflet.divIcon({
          className: "camnook-map-pin",
          html: '<span aria-hidden="true">●</span>',
          iconAnchor: [12, 24],
          iconSize: [24, 24],
        }),
      });
      if (initialPin) marker.addTo(map);
      const choose = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng]).addTo(map);
        setLatitude(lat.toFixed(5));
        setLongitude(lng.toFixed(5));
        callback.current({
          accuracyMeters: null,
          label: "Manually selected pin",
          latitude: lat,
          longitude: lng,
          source: "map_pin",
        });
        void reverseLabel(lat, lng).then((label) => {
          if (label) setStatus(`Selected near ${label}`);
        });
      };
      map.on("click", (event) => choose(event.latlng.lat, event.latlng.lng));
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        choose(point.lat, point.lng);
      });
      cleanup = () => map.remove();
    });
    return () => { disposed = true; cleanup(); };
  }, [initialPin, mapKey]);

  async function search() {
    if (query.trim().length < 3) {
      setStatus("Enter at least 3 characters.");
      return;
    }
    setStatus("Searching…");
    try {
      const response = await fetch("/api/kyc/residential-geocode", {
        body: JSON.stringify({ mode: "search", query: query.trim() }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = await response.json() as { suggestions?: Suggestion[] };
      if (!response.ok || !body.suggestions) throw new Error("search_failed");
      setSuggestions(body.suggestions);
      setStatus(body.suggestions.length ? "Choose a result below." : "No matching Philippine address found.");
    } catch {
      setStatus("Address search is unavailable. You can place the pin manually or continue without it.");
    }
  }

  function chooseSuggestion(suggestion: Suggestion) {
    setLatitude(String(suggestion.latitude));
    setLongitude(String(suggestion.longitude));
    onDraftChange({
      accuracyMeters: null,
      label: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      source: "map_pin",
    });
    setStatus(`Selected ${suggestion.label}.`);
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setStatus("Location is not available in this browser. You can continue without a pin.");
      return;
    }
    setStatus("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          accuracyMeters: position.coords.accuracy,
          label: "Device location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "device_gps" as const,
        };
        if (!isPhilippineCoordinate(next.latitude, next.longitude)) {
          setStatus("The reported location is outside the Philippines.");
          return;
        }
        setLatitude(next.latitude.toFixed(5));
        setLongitude(next.longitude.toFixed(5));
        onDraftChange(next);
        setStatus("Device location selected. Confirm the pin below.");
      },
      () => setStatus("Location permission was denied or unavailable. You can continue without a pin."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  }

  function placeCoordinates() {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isPhilippineCoordinate(lat, lng)) {
      setStatus("Enter valid Philippine coordinates.");
      return;
    }
    onDraftChange({
      accuracyMeters: null,
      label: "Coordinates entered manually",
      latitude: lat,
      longitude: lng,
      source: "map_pin",
    });
    setStatus("Coordinates selected. Confirm the pin below.");
  }

  return (
    <div className="space-y-4">
      {!mapKey ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
          The map is not configured. You can save your written address without a pin.
        </p>
      ) : (
        <div aria-label="Residential pin map" className="camnook-leaflet-map h-72 w-full overflow-hidden rounded-xl border border-stone-300" ref={container} role="application" />
      )}

      <div>
        <label className="text-sm font-medium" htmlFor="residential-map-search">Search a Philippine address</label>
        <div className="mt-2 flex gap-2">
          <input
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3"
            id="residential-map-search"
            maxLength={300}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
            value={query}
          />
          <button className="rounded-xl border border-stone-300 px-4 font-medium" onClick={() => void search()} type="button">Search</button>
        </div>
        {suggestions.length ? (
          <ul className="mt-2 space-y-2" aria-label="Address search results">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.latitude}:${suggestion.longitude}:${index}`}>
                <button className="w-full rounded-xl bg-stone-50 p-3 text-left text-sm hover:bg-stone-100" onClick={() => chooseSuggestion(suggestion)} type="button">{suggestion.label}</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <button className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-medium" onClick={useLocation} type="button">Use my location</button>

      <fieldset>
        <legend className="text-sm font-medium">Keyboard pin placement</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Latitude<input className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" inputMode="decimal" onChange={(event) => setLatitude(event.target.value)} value={latitude} /></label>
          <label className="text-sm">Longitude<input className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" inputMode="decimal" onChange={(event) => setLongitude(event.target.value)} value={longitude} /></label>
        </div>
        <button className="mt-2 min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-medium" onClick={placeCoordinates} type="button">Place pin at coordinates</button>
      </fieldset>
      <p aria-live="polite" className="text-sm text-stone-600">{status}</p>
    </div>
  );
}

function isPhilippineCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && latitude >= 4 && latitude <= 22 &&
    Number.isFinite(longitude) && longitude >= 116 && longitude <= 127;
}

async function reverseLabel(latitude: number, longitude: number) {
  try {
    const response = await fetch("/api/kyc/residential-geocode", {
      body: JSON.stringify({ latitude, longitude, mode: "reverse" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json() as { label?: string };
    return response.ok ? body.label ?? null : null;
  } catch {
    return null;
  }
}
